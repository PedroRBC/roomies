import type { Member, User } from "./api";
export interface FeatureProps {
  houseId: string;
  user: User;
  role: string | null;
  members: Member[];
  onUnauthorized: () => void;
  onChanged?: () => void;
}
export const housePath = (id: string) => `/houses/${encodeURIComponent(id)}`;
