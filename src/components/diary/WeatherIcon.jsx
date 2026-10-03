const WEATHER_ART = {
  sunny: (
    <>
      <circle cx="16" cy="16" r="5.5" />
      <path d="M16 3v3M16 26v3M3 16h3M26 16h3M6.8 6.8l2.1 2.1M23.1 23.1l2.1 2.1M6.8 25.2l2.1-2.1M23.1 8.9l2.1-2.1" />
    </>
  ),
  'partly-cloudy': (
    <>
      <path d="M8 16.7a5 5 0 1 1 8.6-5.1M10.5 2.5v2M2.5 10.5h2M4.8 4.8l1.5 1.5M16.2 4.8l-1.5 1.5" />
      <path d="M10 26a5.5 5.5 0 0 1-.1-11 7.3 7.3 0 0 1 13.5 1.4A4.8 4.8 0 1 1 24 26Z" />
    </>
  ),
  cloudy: (
    <>
      <path d="M8.2 12.8a6.3 6.3 0 0 1 11.7-3 4.7 4.7 0 0 1 7.6 5.5" />
      <path d="M8 26a5.5 5.5 0 0 1-.2-11 7.3 7.3 0 0 1 13.7 1.1A5 5 0 1 1 23 26Z" />
    </>
  ),
  rainy: (
    <>
      <path d="M8 21a5 5 0 0 1-.1-10 7.2 7.2 0 0 1 13.5.8A4.6 4.6 0 1 1 23 21Z" />
      <path d="m10 25-1.5 3M17 25l-1.5 3M24 25l-1.5 3" />
    </>
  ),
  stormy: (
    <>
      <path d="M9 21H8a5 5 0 0 1-.1-10 7.2 7.2 0 0 1 13.5.8A4.6 4.6 0 1 1 23 21h-2" />
      <path d="m16.5 17-4 7h5l-3 6 7-9h-5l3-4" />
    </>
  ),
};

export function WeatherIcon({ weather, size = 24, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {WEATHER_ART[weather] || WEATHER_ART.cloudy}
    </svg>
  );
}

const ICON_ART = {
  'arrow-left': <path d="M19 12H5m7-7-7 7 7 7" />,
  'chevron-left': <path d="m15 5-7 7 7 7" />,
  'chevron-right': <path d="m9 5 7 7-7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12 4.5 4.5L19 7" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />
    </>
  ),
  pen: (
    <>
      <path d="m14 5 5 5M4 20l1-5L16 4a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19Z" />
      <path d="m5 15 4 4" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-3-2-6-2.4-9-1v14c3-1.4 6-1 9 1 3-2 6-2.4 9-1V5c-3-1.4-6-1-9 1Zm0 0v14" />
    </>
  ),
};

export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {ICON_ART[name] || null}
    </svg>
  );
}
