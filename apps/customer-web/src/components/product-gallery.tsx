'use client';

import { useState } from 'react';
import { ProductPhoto } from './product-photo';

/** Cover photo plus the seller's extra photos; thumbnails switch the large photo. */
export function ProductGallery({
  photos,
  alt,
  label,
}: {
  readonly photos: readonly string[];
  readonly alt: string;
  /** Accessible name of the thumbnails group, e.g. "Photos du produit". */
  readonly label: string;
}) {
  const [index, setIndex] = useState(0);
  const current = photos[index] ?? photos[0] ?? '/assets/product-placeholder.svg';
  return (
    <div className="product-gallery">
      <div className="product-detail__image">
        <ProductPhoto
          key={current}
          src={current}
          alt={photos.length > 1 ? `${alt} (${index + 1}/${photos.length})` : alt}
          width={850}
          height={700}
          priority={index === 0}
          sizes="(max-width: 760px) 100vw, 45vw"
        />
      </div>
      {photos.length > 1 && (
        <div className="product-gallery__thumbs" role="group" aria-label={label}>
          {photos.map((photo, position) => (
            <button
              key={photo}
              type="button"
              aria-pressed={position === index}
              aria-label={`${label} ${position + 1}/${photos.length}`}
              onClick={() => setIndex(position)}
            >
              <ProductPhoto src={photo} alt="" width={72} height={72} sizes="72px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
