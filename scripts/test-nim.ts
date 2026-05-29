import OpenAI from 'openai';
import { config } from 'dotenv';
config({ path: '.env.local' });

async function testNim() {
  try {
    const openai = new OpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.NVIDIA_API_KEY_1,
    });
    console.log('Testing Llama 4 Maverick...');
    const res = await openai.chat.completions.create({
      model: 'meta/llama-4-maverick',
      messages: [{ role: 'user', content: 'hi' }]
    });
    console.log('NIM SUCCESS', res.choices[0].message.content);
  } catch (e) {
    console.error('NIM ERROR:', e.message);
  }
}

async function testGroq() {
  try {
    const openai = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_KEY_1,
    });
    console.log('Testing Groq Whisper...');
    const res = await openai.models.retrieve('whisper-large-v3-turbo');
    console.log('GROQ SUCCESS', res.id);
  } catch (e) {
    console.error('GROQ ERROR:', e.message);
  }
}

async function run() {
  await testGroq();
  await testNim();
}
run();
