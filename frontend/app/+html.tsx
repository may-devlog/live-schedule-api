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
        <meta name="description" content="ライブの予定と費用を、ひとつの場所に。" />
        <meta property="og:title" content="GenBGT" />
        <meta property="og:description" content="ライブの予定と費用を、ひとつの場所に。" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="GenBGT" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="GenBGT" />
        <meta name="twitter:description" content="ライブの予定と費用を、ひとつの場所に。" />
        <meta name="application-name" content="GenBGT" />
        <meta name="apple-mobile-web-app-title" content="GenBGT" />
        <meta name="theme-color" content="#18181B" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="dns-prefetch" href="https://api.genbgt.com" />
        <link rel="preconnect" href="https://api.genbgt.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: 'window.__genbgtReplaceState = window.history.replaceState.bind(window.history);' }} />
        <ScrollViewStyleReset />
      </head>
      <body>
        {/*
          height:100%を指定しないと、#root/body/htmlに設定されているheight:100%の連鎖が
          このラッパーで途切れ、#rootの高さが解決できずアプリの内容全体が
          （DOM上には存在するが視覚的には）非表示になってしまう。
        */}
        <div data-nosnippet style={{ height: '100%' }}>{children}</div>
      </body>
    </html>
  );
}
