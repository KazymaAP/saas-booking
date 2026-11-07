import { redirect } from 'next/navigation';
import { readPartnerSession } from '@/lib/partners-auth';
import { getPartnerById, listLeads, partnerSummary, listCheckouts, listReadySites, listEarnings, yookassaConfigured } from '@/lib/partners';
import { listPartnerReadyServices, listPartnerMessages, outreachForRows } from '@/lib/ready-services';
import { SITE_URL } from '@/lib/site';
import { listReferrals } from '@/lib/referrals';
import { isDemoPartner } from '@/lib/demo-constants';
import { PartnerShell } from './PartnerShell';

export const dynamic = 'force-dynamic';

export default async function PartnerDashboard() {
  const session = readPartnerSession();
  if (!session) redirect('/partner/login');
  const partner = await getPartnerById(session.partnerId);
  if (!partner) redirect('/partner/login');

  const [leads, summary, checkouts, readySites, ready, messages, referrals, earnings] = await Promise.all([
    listLeads(partner.id),
    partnerSummary(partner.id),
    listCheckouts(partner.id),
    listReadySites(),
    listPartnerReadyServices(partner.id),
    listPartnerMessages(partner.id),
    listReferrals(partner.id),
    listEarnings(partner.id),
  ]);

  // Готовые тексты первого сообщения — считаем на сервере: шаблон может быть переопределён в настройках.
  const outreach = await outreachForRows(
    [...ready.available, ...ready.mine],
    partner.name ?? partner.email,
    SITE_URL,
  );

  return (
    <PartnerShell
      partner={partner}
      summary={summary}
      leads={leads}
      checkouts={checkouts}
      readySites={readySites}
      ready={ready}
      messages={messages}
      referrals={referrals}
      outreach={outreach}
      earnings={earnings}
      yookassaReady={yookassaConfigured()}
      demo={isDemoPartner(partner.email)}
    />
  );
}
