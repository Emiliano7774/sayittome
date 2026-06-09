export function generateReferralCode(seed = "") {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let hash = 0;

  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }

  if (!hash) {
    hash = Math.floor(Math.random() * 1_000_000_000);
  }

  let code = "";
  for (let i = 0; i < 8; i++) {
    code += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) || (hash ^ (i + 1));
  }

  return code;
}
