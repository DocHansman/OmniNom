// Helper utilities for byte conversions

export function hexToUint8Array(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const view = new Uint8Array(hex.length / 2);
  for (let i = 0; i < view.length; i++) {
    view[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return view;
}

export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives Auth Key hash and AES-GCM key from Master Key Hex.
 * Matches Backend's implementation of HKDF-SHA256.
 */
export async function deriveKeys(masterKeyHex: string): Promise<{
  authKeyHashHex: string;
  cryptoKey: CryptoKey;
}> {
  const masterKeyBytes = hexToUint8Array(masterKeyHex);

  // Import master key as raw base key for HKDF
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    masterKeyBytes as any,
    "HKDF",
    false,
    ["deriveKey", "deriveBits"]
  );

  // Derive Auth Key bits
  const authKeyBytes = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("auth_v1"),
      info: new TextEncoder().encode("OmniNom Auth"),
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  // Hash the Auth Key using SHA-256 to prove ownership
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", authKeyBytes);
  const authKeyHashHex = uint8ArrayToHex(new Uint8Array(hashBuffer));

  // Derive Crypto Key bits
  const cryptoKeyBytes = await window.crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("data_v1"),
      info: new TextEncoder().encode("OmniNom Data"),
    },
    baseKey,
    256 // 256 bits = 32 bytes
  );

  // Import Crypto Key bytes as AES-GCM key for local encryption
  const cryptoKey = await window.crypto.subtle.importKey(
    "raw",
    cryptoKeyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  return {
    authKeyHashHex,
    cryptoKey,
  };
}

/**
 * Encrypts plaintext using AES-GCM-256.
 * Returns Base64 of (12-byte IV + ciphertext).
 */
export async function encrypt(cryptoKey: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    enc.encode(plaintext)
  );

  // Combine IV + Ciphertext
  const combined = new Uint8Array(iv.length + ciphertextBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuffer), iv.length);

  return arrayBufferToBase64(combined.buffer);
}

/**
 * Decrypts Base64 string containing (12-byte IV + ciphertext) using AES-GCM-256.
 */
export async function decrypt(cryptoKey: CryptoKey, base64Ciphertext: string): Promise<string> {
  const combined = base64ToUint8Array(base64Ciphertext);
  if (combined.length < 12) {
    throw new Error("Ciphertext too short, missing IV");
  }

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    cryptoKey,
    ciphertext
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}
