export interface Lead {
  id: string;
  job_id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  website_url: string | null;
  website_source: string | null;
  website_confidence: number | null;
  rating: number | null;
  reviews_count: number | null;
  decision_maker_name: string | null;
  decision_maker_role: string | null;
  decision_maker_source_url: string | null;
  decision_maker_confidence: number | null;
  linkedin_url: string | null;
  corporate_email: string | null;
  email_status: string;
  source: string;
  created_at: string;
}

export function exportLeadsToCSV(leads: Lead[], filename: string) {
  const headers = [
    'Nome do Negócio', 'Endereço', 'Telefone', 'Website', 'Rating', 'Reviews',
    'Decisor', 'Cargo', 'LinkedIn', 'E-mail Corporativo', 'Status E-mail', 'Fonte'
  ];

  const rows = leads.map(l => [
    l.name, l.address, l.phone, l.website,
    l.rating?.toString() ?? '', l.reviews_count?.toString() ?? '',
    l.decision_maker_name ?? '', l.decision_maker_role ?? '',
    l.linkedin_url ?? '', l.corporate_email ?? '',
    l.email_status, l.source
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
