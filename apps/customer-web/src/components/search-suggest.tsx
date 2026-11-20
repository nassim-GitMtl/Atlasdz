'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { formatMoney } from '@/lib/catalog-view';
import { lang, localizedHref, type Locale } from '@/lib/i18n';

type Suggestion = { slug: string; title: string; priceMinor: number };

/**
 * The header search box with product suggestions (ARIA combobox). Arrow keys move through
 * the list, Enter opens the highlighted product, Escape closes; without a highlight the form
 * submits a normal search.
 */
export function SearchSuggest({
  locale,
  defaultValue,
  placeholder,
}: {
  readonly locale: Locale;
  readonly defaultValue: string;
  readonly placeholder: string;
}) {
  const router = useRouter();
  const listId = useId();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const latest = useRef('');

  useEffect(() => {
    const query = value.trim();
    latest.current = query;
    if (query.length < 2) return;
    // Wait for a short pause in typing; late answers for an older text are ignored.
    const timer = setTimeout(() => {
      fetch(`/search/suggest?q=${encodeURIComponent(query)}&lang=${locale}`)
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .then((data: { items: Suggestion[] }) => {
          if (latest.current !== query) return;
          setItems(data.items);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [value, locale]);

  const shown = open && value.trim().length >= 2 && items.length > 0;
  const go = (item: Suggestion) => {
    setOpen(false);
    router.push(localizedHref(`/product/${item.slug}`, locale));
  };

  return (
    <div className="search-suggest">
      <input
        id="catalog-search"
        name="query"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        maxLength={120}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (!shown) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => (index + 1) % items.length);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => (index <= 0 ? items.length - 1 : index - 1));
          } else if (event.key === 'Escape') {
            setOpen(false);
          } else if (event.key === 'Enter' && active >= 0) {
            const item = items[active];
            if (item) {
              event.preventDefault();
              go(item);
            }
          }
        }}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={lang(locale, 'Suggestions', 'اقتراحات', 'Suggestions')}
        className="search-suggest__list"
        hidden={!shown}
      >
        {items.map((item, index) => (
          <li
            key={item.slug}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => {
              // Before the input loses focus, so the click is not lost.
              event.preventDefault();
              go(item);
            }}
          >
            <span>{item.title}</span>
            <bdi>{formatMoney(item.priceMinor, locale)}</bdi>
          </li>
        ))}
      </ul>
    </div>
  );
}
