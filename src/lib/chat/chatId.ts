export function makeChatId(
  a: string,
  b: string,
  anon: string,
) {
  return [a, b]
    .sort()
    .join("_") +
    "__" +
    anon;
}
