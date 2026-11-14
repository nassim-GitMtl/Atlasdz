import Image from 'next/image';

// Seller photos stored by the API: /media/<uuid>.webp (max 1600 px) plus a 640 px variant.
const SELLER_PHOTO =
  /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/;

type ProductPhotoProps = {
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
  readonly sizes?: string;
  readonly priority?: boolean;
};

/**
 * Product image. Seller photos are served as stored (the API makes both sizes at upload)
 * instead of through the Next image optimizer: its cache keeps serving an image after the file
 * is deleted, which would defeat photo removal and staff takedowns. Bundled assets still use
 * next/image.
 */
export function ProductPhoto({
  src,
  alt,
  width,
  height,
  sizes,
  priority = false,
}: ProductPhotoProps) {
  const id = SELLER_PHOTO.exec(src)?.[1];
  if (id === undefined) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        {...(sizes === undefined ? {} : { sizes })}
      />
    );
  }
  return (
    <img
      src={src}
      srcSet={`/media/${id}-640.webp 640w, ${src} 1600w`}
      sizes={sizes ?? `${width}px`}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  );
}
