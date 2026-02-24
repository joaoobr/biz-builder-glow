import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface LeadsTableProps {
  leads: any[];
}

const LeadsTable = ({ leads }: LeadsTableProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Resultados</CardTitle>
        <Input placeholder="Buscar leads..." className="max-w-xs h-9" />
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/50">
                {['Nome', 'Endereço', 'Telefone', 'Website', 'Rating', 'Reviews', 'Decisor', 'Cargo', 'LinkedIn', 'E-mail', 'Status', 'Fonte'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-muted-foreground">
                    Crie um job para ver resultados aqui.
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <tr key={lead.id || i} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 whitespace-nowrap">{lead.name || '—'}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{lead.address || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.phone || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.website || '—'}</td>
                    <td className="px-3 py-2">{lead.rating || '—'}</td>
                    <td className="px-3 py-2">{lead.reviews_count || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.decision_maker_name || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.decision_maker_title || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.linkedin_url || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.email || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.email_status || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{lead.source || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadsTable;
