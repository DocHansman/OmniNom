#!/bin/bash
set -e

# Run the Ktor app CLI command to generate a user and get the JSON
echo "Generiere neuen E2EE-User in der Datenbank..."
OUTPUT=$(java -jar /app/ktorBackend.jar generate-qr)

# Extract the JSON line between markers
JSON=$(echo "$OUTPUT" | grep -A 1 "===JSON_START===" | grep -v "===JSON_START===" | grep -v "===JSON_END===" | tr -d '\r\n')

if [ -z "$JSON" ]; then
    echo "Fehler bei der Generierung des Verbindungs-JSONs:"
    echo "$OUTPUT"
    exit 1
fi

echo ""
echo "----------------------------------------------------------------------"
echo "ACHTUNG: Diesen QR-Code nur auf deinem eigenen Bildschirm scannen!"
echo "Er enthaelt den E2EE Master-Key für deinen privaten Haushalt."
echo "Teile diesen Code niemals mit Dritten oder ueber unsichere Kanaele!"
echo "----------------------------------------------------------------------"
echo ""

# Render scanable ASCII QR code in terminal
echo "$JSON" | qrencode -t ansiutf8

echo ""
echo "Scanne diesen QR-Code mit der CookingApp (Gerät 1) bei der Ersteinrichtung."
echo ""
