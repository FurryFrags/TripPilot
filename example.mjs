import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import clientModule from './pollinationsClient.js';

const { PollinationsClient, Throttler } = clientModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'destination';

const asList = (models) => {
  if (Array.isArray(models)) return models;
  if (models && Array.isArray(models.models)) return models.models;
  if (models && Array.isArray(models.data)) return models.data;
  return [];
};

const summarizeApiError = (error) => {
  const msg = error instanceof Error ? error.message : String(error);
  if (/429|rate limit|capacity-limited|placeholder/i.test(msg)) {
    return `Rate-limit/capacity warning: ${msg}`;
  }
  if (/timed out|timeout|ECONNRESET|ENOTFOUND|network/i.test(msg)) {
    return `Transient network/retry warning: ${msg}`;
  }
  return msg;
};

const client = new PollinationsClient({
  apiKey: process.env.POLLINATIONS_API_KEY,
  minIntervalMs: 16_000,
  timeoutMs: 45_000,
  maxRetries: 3,
});

try {
  // 1) Non-stream chatCompletions
  console.log('\n=== 1) non-stream chatCompletions ===');
  const chatResponse = await client.chatCompletions({
    model: 'openai',
    messages: [
      {
        role: 'user',
        content: 'Top 3 hidden-gem beach destinations in Thailand for a 7-day tour.',
      },
    ],
    temperature: 0.7,
  });

  const chatText =
    chatResponse?.choices?.[0]?.message?.content ??
    JSON.stringify(chatResponse, null, 2);
  console.log(chatText);

  // 2) Streaming chatCompletions
  console.log('\n=== 2) streaming chatCompletions ===');
  const streamResponse = await client.chatCompletions({
    model: 'openai',
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'Stream a short teaser itinerary for those same 3 destinations.',
      },
    ],
  });

  if (!streamResponse.body) {
    throw new Error('Streaming response had no readable body.');
  }

  const reader = streamResponse.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    process.stdout.write(chunk);
  }
  process.stdout.write('\n');

  // 3) textGET JSON mode + parse/use structured output
  console.log('\n=== 3) textGET with { json: true } ===');
  const structured = await client.textGET(
    'Return strictly valid JSON with key "destinations" as an array of exactly 3 objects. Each object must have "name", "whyHiddenGem", and "bestMonths" (array of month names). Theme: hidden-gem Thailand beaches for a 7-day tour.',
    { json: true, model: 'openai' },
  );

  const destinations = Array.isArray(structured?.destinations)
    ? structured.destinations
    : [];

  console.log(`Structured destination count: ${destinations.length}`);
  destinations.forEach((d, i) => {
    console.log(`${i + 1}. ${d?.name ?? 'Unknown'} — ${d?.whyHiddenGem ?? 'n/a'}`);
  });

  // 4) Model discovery helpers
  console.log('\n=== 4) listTextModels + listImageModels ===');
  const textModelsRaw = await client.listTextModels();
  const imageModelsRaw = await client.listImageModels();
  const textModels = asList(textModelsRaw);
  const imageModels = asList(imageModelsRaw);

  console.log(`Text models count: ${textModels.length}`);
  console.log('Text model sample:', textModels.slice(0, 3));
  console.log(`Image models count: ${imageModels.length}`);
  console.log('Image model sample:', imageModels.slice(0, 3));

  // 5) imageURL + fetch + writeFile for each destination
  console.log('\n=== 5) Generate images and save to ./output ===');
  const outputDir = path.join(__dirname, 'output');
  await fs.mkdir(outputDir, { recursive: true });

  for (const destination of destinations) {
    const name = destination?.name || 'Unknown Thailand Beach';
    const prompt = `Travel photo of ${name}, hidden-gem beach in Thailand, golden hour, cinematic, ultra detailed`;
    const imageUrl = client.imageURL(prompt, { model: 'flux', width: 1024, height: 768 });

    // Pace direct fetch calls through shared throttler too.
    const imageResponse = await Throttler.schedule(client.minIntervalMs, () =>
      client.fetchWithTimeout(imageUrl, { headers: client._headers() }),
    );

    if (!imageResponse.ok) {
      throw new Error(`Image generation failed for ${name}: HTTP ${imageResponse.status}`);
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    const fileName = `${slugify(name)}.jpg`;
    const filePath = path.join(outputDir, fileName);
    await fs.writeFile(filePath, bytes);
    console.log(`Saved: ${filePath}`);
  }

  console.log('\nDone.');
} catch (error) {
  console.error('\nExample script failed.');
  console.error(summarizeApiError(error));
  process.exitCode = 1;
}
