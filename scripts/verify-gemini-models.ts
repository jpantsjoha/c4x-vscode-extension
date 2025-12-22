
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Load .env manually
const envPath = path.resolve(__dirname, '../.env');
let apiKey = process.env.GEMINI_API_KEY;

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=['"]?([^'"\n]+)['"]?/);
    if (match) {
        apiKey = match[1];
    }
}

if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found in .env file or environment variables');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function main() {
    console.log('🔍 Checking available Gemini models...');

    try {
        const modelsToTest = [
            'gemini-3-flash-preview',
            'gemini-3-pro-preview',
            'gemini-3-pro-image-preview',
            'gemini-2.5-pro'
        ];
        console.log('\n🧪 Testing Model Availability & Generation:\n');

        for (const modelName of modelsToTest) {
            process.stdout.write(`Testing ${modelName.padEnd(25)} ... `);
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent('Hello, are you online? Respond with "Yes".');
                const response = await result.response;
                const text = response.text();
                console.log(`✅ OK(Response: "${text.trim()}")`);
            } catch (error: any) {
                if (error.message.includes('404')) {
                    console.log(`❌ Not Found(404)`);
                } else {
                    const msg = error.message.split('\n')[0];
                    if (msg.includes('400')) console.log(`❌ Bad Request(400) - likely invalid model name`);
                    else console.log(`❌ Error: ${msg} `);
                }
            }
        }

    } catch (error: any) {
        console.error('Global Error:', error);
    }
}

main();
