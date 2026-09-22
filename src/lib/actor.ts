/** Current signed-in display name used for audit stamps. Set by App on sign-in. */
let actor = "Owner";

export function setActor(name: string) {
  actor = name || "Owner";
}

export function currentActor(): string {
  return actor;
}
