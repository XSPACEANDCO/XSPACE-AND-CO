import { useMemo } from 'react';
import { isQualified, reachedVisit } from '../../../lib/leadStatus';
import { useDashboard } from '../DashboardStore';

/* The creator's numbers, counted from their own records.

   `media` is /media/mine and `leads` is the scoped /leads — both already only
   theirs. A lead is credited to a piece of content when it names it as its
   source (leads.source_media_id); that link is what turns "I posted a reel"
   into "my reel produced three qualified buyers". */
export function useCreatorStats() {
  const { media, leads } = useDashboard();

  return useMemo(() => {
    const published = media.filter((m) => m.status === 'approved');
    const reach = published.reduce((n, m) => n + (m.views || 0), 0);
    const qualified = leads.filter((l) => isQualified(l.status));
    const visits = leads.filter((l) => reachedVisit(l.status));
    const deals = leads.filter((l) => l.status === 'Closed');

    const leadsFor = (id) => leads.filter((l) => l.sourceMediaId === id);

    /* Per published piece, best performers first: leads it produced, then
       reach, then newest. */
    const perContent = published
      .map((m) => {
        const own = leadsFor(m.id);
        return {
          media: m,
          views: m.views,
          leads: own.length,
          qualified: own.filter((l) => isQualified(l.status)).length,
        };
      })
      .sort(
        (a, b) =>
          b.leads - a.leads ||
          (b.views || 0) - (a.views || 0) ||
          new Date(b.media.createdAt) - new Date(a.media.createdAt)
      );

    return {
      media,
      leads,
      published,
      reach,
      reachKnown: published.some((m) => m.views !== null && m.views !== undefined),
      qualified,
      visits,
      deals,
      perContent,
      attributed: leads.filter((l) => l.sourceMediaId),
    };
  }, [media, leads]);
}
