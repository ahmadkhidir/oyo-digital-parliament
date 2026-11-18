/**
 * SigV4 signing (`C-036`).
 *
 * The algorithm is proven against AWS's published test vector for a header-signed request: the
 * canonical request, the string to sign and the signature must all match exactly. That vector is the
 * evidence that a change here cannot quietly break every signed write in production.
 *
 * The presigned form is proven structurally — the parameters, the expiry and determinism — because
 * the vector suite covers header signing and the two forms share the same canonicalisation.
 */
import { describe, expect, it } from 'vitest';

import {
  amzDate,
  buildCanonicalRequest,
  canonicalQuery,
  canonicalUri,
  dateStamp,
  encodeComponent,
  presignGet,
  sha256Hex,
  signRequest,
} from './sign.ts';

/** AWS's published SigV4 test credentials. Not a live credential; public documentation only. */
const VECTOR = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  instant: new Date('2015-08-30T12:36:00Z'),
} as const;

describe('SigV4', () => {
  it('reproduces the AWS header-signing test vector', () => {
    const result = signRequest({
      method: 'GET',
      path: '/',
      query: {},
      headers: { host: 'example.amazonaws.com', 'x-amz-date': '20150830T123600Z' },
      payloadHash: sha256Hex(''),
      ...VECTOR,
    });

    expect(result.canonicalRequest).toBe(
      [
        'GET',
        '/',
        '',
        'host:example.amazonaws.com',
        'x-amz-date:20150830T123600Z',
        '',
        'host;x-amz-date',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ].join('\n'),
    );
    expect(result.stringToSign).toBe(
      [
        'AWS4-HMAC-SHA256',
        '20150830T123600Z',
        '20150830/us-east-1/service/aws4_request',
        'bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63',
      ].join('\n'),
    );
    expect(result.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });

  it('encodes the date forms the signature carries', () => {
    expect(amzDate(VECTOR.instant)).toBe('20150830T123600Z');
    expect(dateStamp(VECTOR.instant)).toBe('20150830');
  });

  it('encodes path segments and query components the way SigV4 requires', () => {
    expect(canonicalUri('/exports/request/drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/20261125T120000Z')).toBe(
      '/exports/request/drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/20261125T120000Z',
    );
    expect(canonicalUri('/a b/c')).toBe('/a%20b/c');
    expect(encodeComponent("a!'()*b")).toBe('a%21%27%28%29%2Ab');
    expect(canonicalQuery({ b: '2', a: '1', c: '' })).toBe('a=1&b=2&c=');
  });

  it('signs the same request identically and a different secret differently', () => {
    const input = {
      method: 'PUT',
      path: '/bucket/key',
      query: {},
      headers: { host: 'storage.example.test', 'x-amz-date': '20261118T090000Z' },
      payloadHash: sha256Hex('body'),
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'secret-one',
      instant: new Date('2026-11-18T09:00:00Z'),
    } as const;

    const first = signRequest(input);
    const again = signRequest(input);
    const other = signRequest({ ...input, secretAccessKey: 'secret-two' });
    expect(first.signature).toBe(again.signature);
    expect(other.signature).not.toBe(first.signature);
  });

  it('presigns a read with the parameter scope, the expiry and a signature', () => {
    const url = new URL(
      presignGet({
        method: 'GET',
        scheme: 'http',
        path: '/odp-local/exports/request/drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/20261125T120000Z',
        host: '127.0.0.1:9100',
        ttlSeconds: 300,
        region: 'us-east-1',
        service: 's3',
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        instant: new Date('2026-11-18T09:00:00Z'),
      }),
    );

    expect(url.protocol).toBe('http:');
    expect(url.host).toBe('127.0.0.1:9100');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Credential')).toContain('/us-east-1/s3/aws4_request');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(url.toString()).not.toContain(VECTOR.secretAccessKey);
  });

  it('builds a canonical request that names only the headers it signs', () => {
    const canonical = buildCanonicalRequest({
      method: 'get',
      path: '/',
      query: {},
      headers: { Host: 'example.amazonaws.com', 'X-Amz-Date': '20150830T123600Z' },
      payloadHash: sha256Hex(''),
      region: 'us-east-1',
      service: 'service',
    });
    expect(canonical.signedHeaders).toBe('host;x-amz-date');
    expect(canonical.canonicalRequest.split('\n')[0]).toBe('GET');
  });
});
