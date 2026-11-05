import http from 'node:http';

export type LoopbackHttpResponse = {
  statusCode: number | undefined;
  headers: http.IncomingHttpHeaders;
  body: string;
};

/** Make a direct local request without routing loopback traffic through proxies. */
export const getLoopbackHttpResponse = (
  url: string
): Promise<LoopbackHttpResponse> =>
  new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer | string) =>
        chunks.push(Buffer.from(chunk))
      );
      response.once('error', reject);
      response.once('end', () =>
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      );
    });
    request.once('error', reject);
  });
