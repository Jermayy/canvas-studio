/** Non-guessable ids for documents, elements and assets (playbook 05). */
export function createId(): string {
  return crypto.randomUUID();
}
