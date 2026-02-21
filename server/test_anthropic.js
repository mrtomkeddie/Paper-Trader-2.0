import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function testAnthropic() {
    console.log('--- Testing Anthropic Connectivity ---');
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
        console.error('Error: ANTHROPIC_API_KEY not found in .env');
        return;
    }

    console.log(`API Key found (length: ${apiKey.length})`);

    const client = new Anthropic({ apiKey });

    try {
        const models = ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"];
        for (const model of models) {
            try {
                console.log(`Sending test message to ${model}...`);
                const message = await client.messages.create({
                    model: model,
                    max_tokens: 10,
                    messages: [{ role: "user", content: "Hello, confirm you are working." }],
                });
                console.log(`Success with ${model}! Response:`, message.content[0].text);
                return; // Stop if any model works
            } catch (err) {
                console.error(`Failed with ${model}:`, err.status, err.message);
            }
        }
    } catch (error) {
        console.error('General Error:', error.message);
    }
}

testAnthropic();
