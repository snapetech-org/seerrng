export default async function* delayedReporter(events) {
  for await (const event of events) {
    if (event.type === 'test:summary' && event.data.file === undefined) {
      // A formatter or filesystem sink can still have work after the tests end.
      await new Promise((resolve) => setTimeout(resolve, 200));
      yield `Complete summary: ${event.data.counts.tests} tests; success=${event.data.success}\n`;
    }
  }
}
