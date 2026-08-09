import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
        <title>GenBGT</title>
        <meta name="application-name" content="GenBGT" />
        <meta name="apple-mobile-web-app-title" content="GenBGT" />
        <meta name="theme-color" content="#5B21B6" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
