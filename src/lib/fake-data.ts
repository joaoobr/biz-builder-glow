import { supabase } from '@/integrations/supabase/client';

const fakeLeads = [
  { name: 'Padaria Pão Quente', address: 'Rua das Flores, 123 - Centro', phone: '(11) 3456-7890', website: 'www.paoquente.com.br', rating: 4.5, reviews_count: 128, decision_maker_name: 'Carlos Silva', decision_maker_role: 'Proprietário', linkedin_url: 'https://linkedin.com/in/carlossilva', corporate_email: 'carlos@paoquente.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Auto Mecânica Rápida', address: 'Av. Brasil, 456 - Vila Nova', phone: '(11) 2345-6789', website: 'www.mecanica-rapida.com.br', rating: 4.2, reviews_count: 87, decision_maker_name: 'Ana Oliveira', decision_maker_role: 'Gerente', linkedin_url: null, corporate_email: 'contato@mecanica-rapida.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Salão Belle Hair', address: 'Rua Augusta, 789 - Consolação', phone: '(11) 9876-5432', website: '', rating: 4.8, reviews_count: 256, decision_maker_name: 'Beatriz Costa', decision_maker_role: 'Diretora', linkedin_url: 'https://linkedin.com/in/beatrizcosta', corporate_email: 'beatriz@bellehair.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Farmácia Saúde Total', address: 'Rua XV de Novembro, 321', phone: '(11) 4567-8901', website: 'www.saudetotal.com.br', rating: 3.9, reviews_count: 45, decision_maker_name: null, decision_maker_role: null, linkedin_url: null, corporate_email: null, email_status: 'unknown', source: 'OSM' },
  { name: 'Restaurante Sabor & Arte', address: 'Av. Paulista, 1000 - Bela Vista', phone: '(11) 3210-9876', website: 'www.saborarte.com.br', rating: 4.7, reviews_count: 342, decision_maker_name: 'Roberto Mendes', decision_maker_role: 'Chef/Proprietário', linkedin_url: 'https://linkedin.com/in/robertomendes', corporate_email: 'roberto@saborarte.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Clínica Odonto Plus', address: 'Rua Consolação, 555', phone: '(11) 5678-1234', website: 'www.odontoplus.com.br', rating: 4.4, reviews_count: 98, decision_maker_name: 'Dr. Paulo Reis', decision_maker_role: 'Diretor Clínico', linkedin_url: 'https://linkedin.com/in/pauloreis', corporate_email: 'dr.paulo@odontoplus.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Pet Shop Amigo Fiel', address: 'Rua dos Animais, 88', phone: '(11) 6789-0123', website: '', rating: 4.1, reviews_count: 63, decision_maker_name: 'Juliana Santos', decision_maker_role: 'Proprietária', linkedin_url: null, corporate_email: null, email_status: 'unknown', source: 'OSM' },
  { name: 'Academia FitMax', address: 'Av. Independência, 200', phone: '(11) 7890-1234', website: 'www.fitmax.com.br', rating: 4.6, reviews_count: 187, decision_maker_name: 'Fernando Lima', decision_maker_role: 'Sócio-Diretor', linkedin_url: 'https://linkedin.com/in/fernandolima', corporate_email: 'fernando@fitmax.com.br', email_status: 'catch-all', source: 'OSM' },
  { name: 'Escritório Contábil Precisão', address: 'Rua Comercial, 42 - Sala 3', phone: '(11) 8901-2345', website: 'www.contabilprecisao.com.br', rating: 4.0, reviews_count: 22, decision_maker_name: 'Maria Fernanda', decision_maker_role: 'Contadora Chefe', linkedin_url: 'https://linkedin.com/in/mariafernanda', corporate_email: 'mf@contabilprecisao.com.br', email_status: 'verified', source: 'OSM' },
  { name: 'Loja de Roupas TrendUp', address: 'Shopping Center Norte, Loja 45', phone: '(11) 9012-3456', website: 'www.trendup.com.br', rating: 3.8, reviews_count: 71, decision_maker_name: null, decision_maker_role: null, linkedin_url: null, corporate_email: 'contato@trendup.com.br', email_status: 'unverified', source: 'OSM' },
];

export async function insertFakeLeads(jobId: string) {
  const leadsWithJobId = fakeLeads.map(l => ({ ...l, job_id: jobId }));
  const { error } = await supabase.from('leads').insert(leadsWithJobId);
  if (error) throw error;
  // Update job status to done
  await supabase.from('jobs').update({ status: 'done', progress_step: 5, progress_message: 'Concluído com dados de exemplo' }).eq('id', jobId);
}
