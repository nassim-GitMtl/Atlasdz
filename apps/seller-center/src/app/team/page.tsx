import { redirect } from 'next/navigation';
import { Shell } from '@/components/shell';
import { ServiceState } from '@/components/states';
import { InviteForm, RemoveMemberForm } from '@/components/team-forms';
import { listTeam } from '@/lib/auth';
import { href, lang, localeFrom, type SearchParams } from '@/lib/i18n';
import { orderDate } from '@/lib/orders-copy';
import { accessToken } from '@/lib/session';

/** The shop's team: the owner invites members who handle orders, delivery and support. */
export default async function Team({ searchParams }: { readonly searchParams: Promise<SearchParams> }) {
  const locale = localeFrom((await searchParams).lang);
  const token = await accessToken();
  if (!token) redirect(href('/login', locale));
  const result = await listTeam(token)
    .then((data) => ({ items: data.items, error: undefined }))
    .catch((error: unknown) => ({ items: undefined, error }));
  return (
    <Shell locale={locale} currentPath="/team" signedIn>
      <div className="page-heading">
        <div>
          <h1>{lang(locale, 'Équipe', 'الفريق', 'Team')}</h1>
          <p>
            {lang(
              locale,
              'Les membres traitent les commandes, la livraison, les demandes d’aide et les questions clients. Ils ne peuvent modifier ni les offres, ni les produits, ni les tarifs de livraison, ni les informations légales, ni l’équipe.',
              'يعالج الأعضاء الطلبات والتوصيل وطلبات المساعدة وأسئلة الزبائن، ولا يمكنهم تعديل العروض أو المنتجات أو أسعار التوصيل أو المعلومات القانونية أو الفريق.',
              'Members handle orders, delivery, help requests and customer questions. They cannot change offers, products, delivery prices, legal information or the team.',
            )}
          </p>
        </div>
      </div>
      {result.items ? (
        <>
          <ul className="plain-list panel-list">
            {result.items.map((member) => (
              <li key={member.userId}>
                <span>
                  <bdi dir="ltr">{member.email}</bdi>
                  <small>
                    {member.role === 'OWNER'
                      ? lang(locale, 'Propriétaire', 'المالك', 'Owner')
                      : lang(locale, 'Membre', 'عضو', 'Member')}{' '}
                    · {lang(locale, 'depuis le', 'منذ', 'since')} {orderDate(member.since, locale)}
                    {member.pending
                      ? ` · ${lang(locale, 'invitation en attente', 'دعوة معلّقة', 'invitation pending')}`
                      : ''}
                  </small>
                </span>
                {member.role === 'STAFF' && (
                  <RemoveMemberForm userId={member.userId} email={member.email} locale={locale} />
                )}
              </li>
            ))}
          </ul>
          <section className="holiday-panel" aria-labelledby="invite-title">
            <h2 id="invite-title">{lang(locale, 'Inviter un membre', 'دعوة عضو', 'Invite a member')}</h2>
            <p>
              {lang(
                locale,
                'Il reçoit un e-mail pour choisir son mot de passe, puis active la connexion en deux étapes. 10 membres au plus.',
                'يتلقى رسالة لاختيار كلمة المرور ثم يفعّل التحقق بخطوتين. 10 أعضاء كحد أقصى.',
                'They get an email to choose a password, then set up two-step sign-in. At most 10 members.',
              )}
            </p>
            <InviteForm locale={locale} />
          </section>
        </>
      ) : (
        <ServiceState error={result.error} locale={locale} retryPath="/team" />
      )}
    </Shell>
  );
}
