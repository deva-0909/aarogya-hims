export interface AllergyWarning {
  kind: 'allergy';
  severity: 'Mild' | 'Moderate' | 'Severe';
  message: string;
}

export interface InteractionWarning {
  kind: 'interaction';
  severity: 'Moderate' | 'Severe';
  message: string;
}

export type SafetyWarning = AllergyWarning | InteractionWarning;

/** Case-insensitive substring match -- "Penicillin" allergy flags "Amoxicillin" too, loosely, same as real cross-reactivity checks err on the side of caution. */
function drugMentionsAllergen(drugName: string, allergen: string): boolean {
  const d = drugName.toLowerCase();
  const a = allergen.toLowerCase().trim();
  return a.length > 0 && (d.includes(a) || a.includes(d));
}

export function checkAllergies(drugName: string, allergies: { allergen: string; severity: string; reaction?: string }[]): AllergyWarning[] {
  if (!drugName.trim()) return [];
  return allergies
    .filter((a) => drugMentionsAllergen(drugName, a.allergen))
    .map((a) => ({
      kind: 'allergy',
      severity: (a.severity as any) ?? 'Moderate',
      message: `Patient has a known ${a.severity.toLowerCase()} allergy to ${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}.`,
    }));
}

export function checkInteractions(
  newDrug: string,
  existingDrugs: string[],
  interactions: { drug_a: string; drug_b: string; severity: string; description: string }[]
): InteractionWarning[] {
  if (!newDrug.trim()) return [];
  const newLower = newDrug.toLowerCase();
  const warnings: InteractionWarning[] = [];

  for (const other of existingDrugs) {
    if (!other.trim() || other.toLowerCase() === newLower) continue;
    const otherLower = other.toLowerCase();

    for (const i of interactions) {
      const aMatches = i.drug_a.toLowerCase();
      const bMatches = i.drug_b.toLowerCase();
      const hit =
        (newLower.includes(aMatches) && otherLower.includes(bMatches)) ||
        (newLower.includes(bMatches) && otherLower.includes(aMatches));
      if (hit) {
        warnings.push({
          kind: 'interaction',
          severity: (i.severity as any) ?? 'Moderate',
          message: `${newDrug} + ${other}: ${i.description}`,
        });
      }
    }
  }
  return warnings;
}
