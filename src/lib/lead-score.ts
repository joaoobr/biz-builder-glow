/**
 * Quality score for a lead (0–100).
 * Weights:
 *   - Rating (0–5 → 0–30 pts)
 *   - Reviews count (0–25 pts, log scale)
 *   - Has phone (+15 pts)
 *   - Has website (+20 pts)
 *   - Has address (+10 pts)
 */
export function calcLeadScore(lead: Record<string, any>): number {
  let score = 0;

  // Rating: up to 30 pts
  const rating = Number(lead.rating) || 0;
  if (rating > 0) {
    score += Math.min(30, (rating / 5) * 30);
  }

  // Reviews: up to 25 pts (log scale, 100+ reviews = max)
  const reviews = Number(lead.reviews_count) || 0;
  if (reviews > 0) {
    score += Math.min(25, (Math.log10(reviews + 1) / Math.log10(101)) * 25);
  }

  // Has phone: 15 pts
  if (lead.phone) score += 15;

  // Has website: 20 pts
  if (lead.website || lead.website_url) score += 20;

  // Has address: 10 pts
  if (lead.address) score += 10;

  return Math.round(score);
}

export function scoreLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: 'Excelente', color: 'text-green-400' };
  if (score >= 60) return { text: 'Bom', color: 'text-emerald-400' };
  if (score >= 40) return { text: 'Regular', color: 'text-yellow-400' };
  if (score >= 20) return { text: 'Baixo', color: 'text-orange-400' };
  return { text: 'Mínimo', color: 'text-red-400' };
}
