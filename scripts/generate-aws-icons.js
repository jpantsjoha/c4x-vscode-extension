const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Correct path relative to CWD
const rootDir = 'assets/cloud/AWS/Resource-Icons_07312025';
const { writeCloudIconData, DATA_FILE } = require('./cloud-icon-data');
const outPath = DATA_FILE;

console.log(`Scanning ${rootDir}...`);

// AWS icons structure: Res_Service/Res_Icon_48.svg
const files = glob.sync('**/*_48.svg', { cwd: rootDir });

if (files.length === 0) {
    console.error('No SVG files found! Check path.');
    process.exit(1);
}

const sprites = new Map();

files.forEach(file => {
    const fullPath = path.join(rootDir, file);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Extract viewBox
    const viewBoxMatch = content.match(/viewBox="([^"]+)"/);
    const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 48 48';

    // Extract content inside <svg> tags
    const bodyMatch = content.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    if (bodyMatch) {
        let body = bodyMatch[1];
        
        // Remove newlines and trim
        body = body.replace(/[\r\n]+/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
        
        // Generate key
        const filename = path.basename(file, '.svg');
        // Original: Res_Amazon-Simple-Storage-Service_S3_48
        
        let key = filename
            .replace(/^Res_/, '') // Remove Res_
            .replace(/_48$/, '')  // Remove _48
            .replace(/_/g, '-')   // Underscores to dashes
            .replace(/\s+/g, '-') 
            .toLowerCase();

        // Remove verbose cloud prefixes to make keys typeable
        key = key.replace('amazon-', '')
                 .replace('aws-', '');

        // Prefix with aws- for namespacing
        key = `aws-${key}`;

        if (!sprites.has(key)) {
            sprites.set(key, {
                body: body,
                viewBox: viewBox,
                preserveColor: true
            });
        }
    }
});

writeCloudIconData('aws', Object.fromEntries(sprites));
console.log(`Generated ${outPath} (aws section) with ${sprites.size} unique icons from ${files.length} source files.`);
