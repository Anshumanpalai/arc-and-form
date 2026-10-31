export function ProductImage({ src, alt, className = '', ...props }) {
  if (!src) {
    return <div className={`bg-sand/60 ${className}`} aria-label="Product image unavailable" {...props} />;
  }

  return (
    <img
      src={src}
      alt={alt || ''}
      className={`max-w-full ${className}`}
      loading="lazy"
      {...props}
    />
  );
}
