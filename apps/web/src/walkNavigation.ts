import type { MouseEvent } from "react";

export function revealLinkedSpot(event: MouseEvent<HTMLAnchorElement>): void {
  const targetId = event.currentTarget.hash.slice(1);
  const disclosure = document.getElementById(targetId)?.closest("details");
  if (disclosure !== null && disclosure !== undefined) disclosure.open = true;
}
