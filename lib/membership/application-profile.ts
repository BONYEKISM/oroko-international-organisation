const requiredMembershipProfileFields = [
  ["phone", "phone number"],
  ["country", "country of residence"],
  ["city", "city"],
  ["countryOfOrigin", "country of origin"],
  ["profession", "profession"],
] as const;

export type MembershipApplicationProfile = Partial<
  Record<(typeof requiredMembershipProfileFields)[number][0], string | null | undefined>
>;

export function getMissingMembershipProfileFields(
  profile: MembershipApplicationProfile
) {
  return requiredMembershipProfileFields
    .filter(([field]) => !profile[field]?.trim())
    .map(([, label]) => label);
}
