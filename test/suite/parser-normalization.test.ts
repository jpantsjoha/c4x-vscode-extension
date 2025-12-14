import * as assert from 'assert';
import { c4xParser } from '../../src/parser/C4XParser';

describe('Parser Normalization Test Suite', () => {

    it('Normalizes c4xicons.aws.s3-bucket to aws-s3-bucket', () => {
        const input = `
		%%{ c4: container }%%
		graph TB
		Container(S3, "My Bucket", "AWS S3", $sprite="c4xicons.aws.s3-bucket")
		`;

        const result = c4xParser.parse(input);
        const element = result.elements.find(e => e.id === 'S3');
        assert.strictEqual(element?.sprite, 'aws-s3-bucket', 'Should have stripped c4xicons.aws. prefix');
    });

    it('Normalizes c4xicons.azure.vm to azure-vm', () => {
        const input = `
		%%{ c4: container }%%
		graph TB
		Container(VM, "My VM", "Azure VM", $sprite="c4xicons.azure.vm")
		`;

        const result = c4xParser.parse(input);
        const element = result.elements.find(e => e.id === 'VM');
        assert.strictEqual(element?.sprite, 'azure-vm', 'Should have stripped c4xicons.azure. prefix');
    });

    it('Normalizes c4xicons.std.person to person', () => {
        const input = `
		%%{ c4: system-context }%%
		graph TB
		Person(User, "User", $sprite="c4xicons.std.person")
		`;

        const result = c4xParser.parse(input);
        const element = result.elements.find(e => e.id === 'User');
        assert.strictEqual(element?.sprite, 'person', 'Should have stripped c4xicons.std. prefix');
    });

    it('Handles unquoted dotted identifier c4xicons.aws.s3', () => {
        // Note: The grammar change allowed DottedIdentifier as value.
        // We verify that the parser accepts unquoted value and normalizes it.
        const input = `
		%%{ c4: container }%%
		graph TB
		Container(S3, "My Bucket", "AWS S3", $sprite=c4xicons.aws.s3-bucket)
		`;

        const result = c4xParser.parse(input);
        const element = result.elements.find(e => e.id === 'S3');
        assert.strictEqual(element?.sprite, 'aws-s3-bucket', 'Should handle unquoted dotted identifier and normalize');
    });

    it('Leaves standard sprites alone', () => {
        const input = `
		%%{ c4: container }%%
		graph TB
		Container(DB, "DB", "SQL", $sprite="postgresql")
		`;

        const result = c4xParser.parse(input);
        const element = result.elements.find(e => e.id === 'DB');
        assert.strictEqual(element?.sprite, 'postgresql', 'Should not change standard sprite names');
    });
});
