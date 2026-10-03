export type CoverSurface = "home" | "library";

export const protonDbCoverSurface = (path: string | undefined): CoverSurface | null => {
  if (/^\/(?:routes\/)?library\/home(?:\/|$)/.test(path ?? "")) return "home";
  if (/^\/(?:routes\/)?library(?:\/(?:collections|tab)(?:\/|$)|\/?$)/.test(path ?? "")) return "library";
  return null;
};
