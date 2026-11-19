import { expect, it } from 'vitest';
import { BM_PageNetwork } from './BM_pageNetwork';
it('records bounded network failures without credentials or query strings', () => {
  const BM_network = new BM_PageNetwork();
  BM_network.BM_event('Network.requestWillBeSent', {
    requestId: 'BM_1',
    type: 'Script',
    request: {
      url: 'https://example.com/app.js?token=BM_private',
      headers: { Cookie: 'BM_secret' },
    },
  });
  BM_network.BM_event('Network.loadingFailed', { requestId: 'BM_1', errorText: 'net::ERR_FAILED' });
  const BM_text = JSON.stringify(BM_network.BM_snapshot());
  expect(BM_text).toContain('app.js');
  expect(BM_text).toContain('ERR_FAILED');
  expect(BM_text).not.toContain('BM_private');
  expect(BM_text).not.toContain('BM_secret');
  BM_network.BM_event('Network.requestWillBeSent', {
    requestId: 'BM_2',
    type: 'XHR',
    request: { url: 'https://example.com/api' },
  });
  BM_network.BM_event('Network.loadingFinished', { requestId: 'BM_2' });
  expect((BM_network.BM_snapshot() as { BM_pending: unknown[] }).BM_pending).toHaveLength(0);
});
