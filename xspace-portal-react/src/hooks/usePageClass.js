import { useEffect } from 'react';

/* Tags <body data-page="..."> so the few genuinely document-level rules from
   the original pages (background, overflow) can key off the active route
   without leaking between pages. */
export function usePageClass(name) {
  useEffect(() => {
    document.body.dataset.page = name;
    return () => {
      if (document.body.dataset.page === name) delete document.body.dataset.page;
    };
  }, [name]);
}
