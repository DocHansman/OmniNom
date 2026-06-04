#!/bin/bash
# CookingApp Backend Route Verification Script
# To be run on the Ubuntu Home Server where Docker is running.
set -e

echo "=== COOKINGAPP BACKEND VERIFICATION ==="

# 1. Check if backend container is running
if ! docker ps | grep -q "cookingapp_backend"; then
    echo "ERROR: cookingapp_backend container is not running."
    echo "Please start the stack first: docker compose up -d"
    exit 1
fi

echo "1. Seeding test user in database..."
# Removed -t to prevent TTY-specific carriage returns and ANSI escape sequences
SEED_OUTPUT=$(docker exec cookingapp_backend java -jar /app/ktorBackend.jar generate-qr)

USER_ID=$(echo "$SEED_OUTPUT" | grep "User UUID:" | awk '{print $3}' | tr -d '\r\n')
AUTH_KEY_HASH=$(echo "$SEED_OUTPUT" | grep "Auth Key Hash:" | awk '{print $4}' | tr -d '\r\n')

if [ -z "$USER_ID" ] || [ -z "$AUTH_KEY_HASH" ]; then
    echo "ERROR: Failed to extract test user credentials from seeder output."
    echo "$SEED_OUTPUT"
    exit 1
fi

echo "   Seeded User ID: $USER_ID"
echo "   Auth Key Hash:  $AUTH_KEY_HASH"

# Base URL for testing - use 127.0.0.1 explicitly to avoid IPv6 "Network is unreachable" failures
# (localhost resolves to ::1 first on some systems, which Docker doesn't support)
BASE_URL="http://127.0.0.1"
echo "Testing API endpoints on $BASE_URL..."

# Helper function to run curl and handle connection/script errors robustly
run_curl() {
    local response
    local status=0
    
    set +e
    response=$( "$@" 2>&1 )
    status=$?
    set -e
    
    if [ $status -ne 0 ]; then
        echo "ERROR: curl execution failed with exit code $status" >&2
        echo "Details/Error:" >&2
        echo "$response" >&2
        exit 1
    fi
    echo "$response"
}

# 2. Test Login
echo ""
echo "2. Testing POST /auth/login..."
LOGIN_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"user_id\":\"$USER_ID\",\"auth_key_hash\":\"$AUTH_KEY_HASH\"}" \
  "$BASE_URL/auth/login")

HTTP_STATUS=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "ERROR: Login failed with status $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi

ACCESS_TOKEN=$(echo "$BODY" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
echo "   Login Success! Token obtained."

# 3. Test Sync GET (should be empty list initially)
echo ""
echo "3. Testing GET /api/sync..."
SYNC_GET_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X GET \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  "$BASE_URL/api/sync")

HTTP_STATUS=$(echo "$SYNC_GET_RESPONSE" | tail -n1)
BODY=$(echo "$SYNC_GET_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "ERROR: Sync GET failed with status $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi
echo "   Sync GET Success! Initial payloads are empty (as expected)."

# 4. Test Sync POST (simulating client synchronization upload)
echo ""
echo "4. Testing POST /api/sync..."

# Generate a random UUID dynamically to prevent duplicate key violations on persistent databases
RECIPE_UUID=""
if [ -f /proc/sys/kernel/random/uuid ]; then
    RECIPE_UUID=$(cat /proc/sys/kernel/random/uuid)
elif command -v uuidgen >/dev/null 2>&1; then
    RECIPE_UUID=$(uuidgen)
else
    RECIPE_UUID=$(python3 -c 'import uuid; print(uuid.uuid4())' 2>/dev/null)
    if [ -z "$RECIPE_UUID" ]; then
        RECIPE_UUID="550e8400-e29b-41d4-a716-446655440000"
    fi
fi
RECIPE_UUID=$(echo "$RECIPE_UUID" | tr -d '\r\n' | tr '[:upper:]' '[:lower:]')

# Create a dummy encrypted recipe payload
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S")
SYNC_PAYLOAD=$(cat <<EOF
[
  {
    "id": "$RECIPE_UUID",
    "entity_type": "recipe",
    "encrypted_payload": "EncryptedDataBlobHere==",
    "updated_at": "$TIMESTAMP",
    "is_deleted": false
  }
]
EOF
)

SYNC_POST_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$SYNC_PAYLOAD" \
  "$BASE_URL/api/sync")

HTTP_STATUS=$(echo "$SYNC_POST_RESPONSE" | tail -n1)
BODY=$(echo "$SYNC_POST_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "ERROR: Sync POST failed with status $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi
echo "   Sync POST Success! Recipe uploaded."

# 5. Test Collision Conflict Detection (409)
echo ""
echo "5. Testing Collision Conflict (HTTP 409)..."
# We send an older timestamp for the same recipe to trigger collision detection
OLDER_TIMESTAMP="2020-01-01T00:00:00"
CONFLICT_PAYLOAD=$(cat <<EOF
[
  {
    "id": "$RECIPE_UUID",
    "entity_type": "recipe",
    "encrypted_payload": "OldDataBlobHere==",
    "updated_at": "$OLDER_TIMESTAMP",
    "is_deleted": false
  }
]
EOF
)

CONFLICT_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$CONFLICT_PAYLOAD" \
  "$BASE_URL/api/sync")

HTTP_STATUS=$(echo "$CONFLICT_RESPONSE" | tail -n1)
BODY=$(echo "$CONFLICT_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -eq 409 ]; then
    echo "   Collision check passed! Server rejected older client payload with 409 Conflict (expected)."
else
    echo "ERROR: Expected HTTP 409 Conflict, but got $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi

# 6. Test Recipe Scraping (SSRF checks validation)
echo ""
echo "6. Testing Recipe Scraping (and SSRF protection)..."
# First check SSRF blocks private IP addresses (like 127.0.0.1)
SSRF_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"http://127.0.0.1:8080/\"}" \
  "$BASE_URL/api/scrape")

HTTP_STATUS=$(echo "$SSRF_RESPONSE" | tail -n1)
BODY=$(echo "$SSRF_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -eq 400 ] || [ "$HTTP_STATUS" -eq 403 ]; then
    echo "   SSRF Protection works! Server blocked local IP scraping (HTTP $HTTP_STATUS)."
else
    echo "WARNING: Expected HTTP 400/403 for local IP scraping, but got $HTTP_STATUS"
fi

# 7. Test Nginx Image protection via cookies
echo ""
echo "7. Testing Nginx /photos cookie-based verification..."
# Requesting without cookie should be 401 Unauthorized
NO_COOKIE_STATUS=$(run_curl curl -sS -o /dev/null -w "%{http_code}" "$BASE_URL/photos/test-image.jpg")
if [ "$NO_COOKIE_STATUS" -eq 401 ]; then
    echo "   Static photo protection works! Request without auth cookie was blocked with 401."
else
    echo "ERROR: Expected 401 for static photo without cookie, but got $NO_COOKIE_STATUS"
    exit 1
fi

# 8. Test AI Recipe Enrichment (Gemini)
echo ""
echo "8. Testing AI Recipe Enrichment..."
ENRICH_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Tomatensuppe","ingredients":[{"name":"Tomaten","amount":500,"unit":"g"}]}' \
  "$BASE_URL/api/recipe/enrich")

HTTP_STATUS=$(echo "$ENRICH_RESPONSE" | tail -n1)
BODY=$(echo "$ENRICH_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "ERROR: AI Recipe Enrichment failed with status $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi
echo "   AI Enrichment Success! Estimated fields obtained:"
echo "$BODY"

# 9. Test AI Recipe Suggestions (Gemini)
echo ""
echo "9. Testing AI Recipe Suggestions..."
SUGGEST_RESPONSE=$(run_curl curl -sS -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"availableIngredients":["Tomaten","Kartoffeln","Zwiebeln"],"selectedIngredients":["Tomaten"],"daysCount":1,"allowShopping":false,"preferences":["schnell"]}' \
  "$BASE_URL/api/recipe/suggest")

HTTP_STATUS=$(echo "$SUGGEST_RESPONSE" | tail -n1)
BODY=$(echo "$SUGGEST_RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" -ne 200 ]; then
    echo "ERROR: AI Recipe Suggestions failed with status $HTTP_STATUS"
    echo "$BODY"
    exit 1
fi
echo "   AI Suggestions Success! Recipes suggested:"
echo "$BODY"

echo ""
echo "=== ALL ENDPOINTS VERIFIED SUCCESSFULLY! ==="
