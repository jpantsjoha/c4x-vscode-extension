{{
  // Repeated attribute keys are recorded under module-level symbols, never a
  // string key, so no user attribute (e.g. $duplicateKeys="keep") can collide
  // with them and Object.keys() ignores them (notation decision #320, Decision 3).
  const DUPLICATE_KEYS = Symbol('duplicateKeys');
  const KEY_LOCATIONS = Symbol('keyLocations');

  // How many $key="value" pairs one attribute list holds as written, repeats
  // included (#362). The map keeps one value per key, so the headless tools'
  // entry bound reads this instead. A registered symbol, so src/cli/limits.ts
  // can read it; set non-enumerable on the node, so the parse result's JSON,
  // its own keys and deep equality are unchanged.
  const ATTRIBUTE_COUNT = Symbol.for('c4x.attributeCount');
  function withAttributeCount(node, count) {
    Object.defineProperty(node, ATTRIBUTE_COUNT, { value: count || 0, enumerable: false });
    return node;
  }
  function attributeCount(kvMap) {
    return kvMap && kvMap[ATTRIBUTE_COUNT] ? kvMap[ATTRIBUTE_COUNT] : 0;
  }

  // Style-related raw element fields, added only when present so existing raw
  // elements keep exactly their previous shape.
  function styleFields(kvMap) {
    const fields = {};
    if (kvMap.shape !== undefined) {
      fields.shape = kvMap.shape;
      const locations = kvMap[KEY_LOCATIONS];
      if (locations && locations.shape) fields.shapeLoc = locations.shape;
    }
    const duplicates = kvMap[DUPLICATE_KEYS];
    if (duplicates && duplicates.length > 0) fields.duplicateKeys = duplicates;
    return fields;
  }
}}

{
  // Nesting bound (#362). Boundaries, deployment nodes and subgraphs recurse
  // once per level in this parser and in the model builder; past
  // options.maxNestingDepth (32 by default) the parse stops with a located
  // error at the brace that opens the next level, long before the call stack
  // is at risk. The count is structural: NestEnter/NestLeave/NestUndo keep it
  // balanced across backtracking, and only a brace the grammar is about to
  // match as a block opener is checked, so braces inside labels never count.
  let nestDepth = 0;
  const maxNestingDepth = typeof options.maxNestingDepth === 'number' ? options.maxNestingDepth : 32;
}

Start
  = _ directive:Directive? _ GraphKeyword _ direction:Direction _ statements:StatementList _ {
      const viewType = directive != null ? directive : 'system-context';
      const elements = [];
      const relationships = [];
      const boundaries = [];
      const classDefinitions = [];
      const classAssignments = [];
      const elementStyles = [];
      
      const processStatements = (stmts) => {
          for (const stmt of stmts) {
            if (stmt.type === 'element') {
              elements.push(stmt);
              if (stmt.internalRelationships) {
                // DeploymentNodes might have internal relationships
                 relationships.push(...stmt.internalRelationships);
              }

            } else if (stmt.type === 'relationship') {
              relationships.push(stmt);
            } else if (stmt.type === 'boundary') {
              boundaries.push(stmt);
              if (stmt.elements) {
                processStatements(stmt.elements);
              }
              // Relationships inside boundary blocks are already in stmt.relationships 
              // (which were filtered in BoundaryBlock/Subgraph rules)
              // But if we want to support relationships defined inside (without separate filter),
              // we might need to change how those rules work. 
              // Currently they split: elements, relationships.
              if (stmt.relationships) {
                relationships.push(...stmt.relationships);
              }
            } else if (stmt.type === 'classDef') {
              classDefinitions.push(stmt);
            } else if (stmt.type === 'class') {
              classAssignments.push(stmt);
            } else if (stmt.type === 'elementStyle') {
              elementStyles.push(stmt);
            }
          }
      };

      processStatements(statements);
      
      // Cleanup: Boundaries should only contain Elements in their 'elements' array for the Builder.
      // We remove nested boundaries from the 'elements' property of the boundary object itself,
      // as they are already flattened into the global 'boundaries' list. Their membership is
      // kept in 'childBoundaries' (index into 'boundaries', plus how many element siblings
      // precede it in source) so the builder can record the nesting and the layout engine
      // can draw a nested boundary inside its parent (#339).
      const boundaryIndex = new Map(boundaries.map((b, i) => [b, i]));
      for (const b of boundaries) {
          if (b.elements) {
              const childBoundaries = [];
              let precedingElements = 0;
              for (const el of b.elements) {
                  if (el.type === 'element') {
                      precedingElements++;
                  } else if (el.type === 'boundary' && boundaryIndex.has(el)) {
                      childBoundaries.push({ index: boundaryIndex.get(el), afterElements: precedingElements });
                  }
              }
              if (childBoundaries.length > 0) {
                  b.childBoundaries = childBoundaries;
              }
              b.elements = b.elements.filter(el => el.type === 'element');
          }
      }

      const elementMap = new Map();
      const flattenElements = (list) => {
          let flat = [];
          for (const el of list) {
              flat.push(el);
              if (el.children) {
                  flat = flat.concat(flattenElements(el.children));
              }
          }
          return flat;
      };
      // elements array is already 'flat' regarding boundaries, but DeploymentNodes are hierarchical.
      // Actually processStatements pushed all elements (even nested in DeploymentNodes) to 'elements'?
      // Yes: if (stmt.children) processStatements(stmt.children).
      // So 'elements' is fully flat.
      
      const allElements = elements; // flattenElements(elements); 

      for (const element of allElements) {
        elementMap.set(element.id, element);
      }
      for (const assignment of classAssignments) {
        for (const target of assignment.targets) {
          const element = elementMap.get(target);
          if (element && !element.tags.includes(assignment.className)) {
            element.tags.push(assignment.className);
          }
        }
      }
      const result = { viewType, direction, elements, relationships, boundaries, classDefinitions };
      if (elementStyles.length > 0) result.elementStyles = elementStyles;
      return result;
    }

Directive
  = "%%{" _ "c4:" _ view:Identifier _ "}%%" {
      return view.toLowerCase();
    }

GraphKeyword
  = "graph"

Direction
  = "TB" / "BT" / "LR" / "RL"

StatementList
  = head:Statement tail:(_ Statement)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        if (tail[i][1]) {
          result.push(tail[i][1]);
        }
      }
      return result;
    }
  / _ { return []; }

Statement
  = Comment
  / Title
  / ClassDef
  / ClassAssignment
  / ElementStyle
  / Subgraph
  / DeploymentNode
  / BoundaryBlock
  / ElementCall
  / Element
  / Relationship

Title
  = "title" _ [^\n]* { return { type: 'comment' }; }

BoundaryBlock
  = NestEnter node:BoundaryBlockBody NestLeave { return node; }
  / NestUndo

BoundaryBlockBody
  = type:BoundaryType _ "(" _ id:Identifier _ "," _ label:QuotedString _ ")" _ NestOpen _ elements:SubgraphElementList _ "}" {
      const dirStmt = elements.find(function(el) { return el.type === 'style'; });
      // Include nested boundaries in 'elements' so the Start rule can traverse them
      return {
        type: 'boundary',
        id: id,
        label: label,
        boundaryType: type,
        direction: dirStmt ? dirStmt.direction : undefined,
        elements: elements.filter(function(el) { return el.type === 'element' || el.type === 'boundary'; }),
        relationships: elements.filter(function(el) { return el.type === 'relationship'; }),
        loc: location()
      };
    }

BoundaryType
  = "System_Boundary"
  / "Container_Boundary"
  / "Enterprise_Boundary"

ClassDef
  = "classDef" __ name:Identifier _ body:ClassDefBody? {
      return {
        type: 'classDef',
        name,
        styles: body ? body.trim() : undefined,
        loc: location(),
      };
    }

ClassAssignment
  = "class" __ targets:IdentifierList __ className:Identifier {
      return {
        type: 'class',
        targets,
        className,
      };
    }

// elementStyle <Tag> $key="value", ... (notation decision #320, Decision 3). Top level only.
// Keeps an ordered pair list, not a KVArgs map, so a repeated key is reported
// on its own range. PEG ordered choice backtracks, so an element whose id is
// `elementStyle` still parses as an element or relationship.
ElementStyle
  = "elementStyle" __ tag:(QuotedString / Identifier) _ head:StylePair tail:(_ "," _ StylePair)* {
      return { type: 'elementStyle', tag, properties: [head, ...tail.map(t => t[3])], loc: location() };
    }

StylePair
  = pair:KVPair { return { key: pair.key, value: pair.value, loc: location() }; }

IdentifierList
  = head:Identifier tail:(_ "," _ Identifier)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        result.push(tail[i][3]);
      }
      return result;
    }

ClassDefBody
  = chars:(!"\n" .)+ { return chars.map(function(c) { return c[1]; }).join(''); }

Comment
  = "%%" (!"\n" .)* _ { return { type: 'comment' }; }

Subgraph
  = NestEnter node:SubgraphBody NestLeave { return node; }
  / NestUndo

SubgraphBody
  = "subgraph" _ label:Identifier _ kv:KVArgs? _ NestOpen _ elements:SubgraphElementList _ "}" _ {
      const dirStmt = elements.find(function(el) { return el.type === 'style'; });
      const kvMap = kv || {};
      if (kvMap.code !== undefined) {
        error('$code is only valid on Container and Component elements, not on a subgraph');
      }
      const knownKeys = ['tags', 'sprite'];
      const metadata = {};
      Object.keys(kvMap).forEach(function(key) {
        if (!knownKeys.includes(key)) metadata[key] = kvMap[key];
      });
      return withAttributeCount({
        type: 'boundary',
        label: label,
        direction: dirStmt ? dirStmt.direction : undefined,
        elements: elements.filter(function(el) { return el.type === 'element' || el.type === 'boundary'; }),
        relationships: elements.filter(function(el) { return el.type === 'relationship'; }),
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        loc: location()
      }, attributeCount(kvMap));
    }

SubgraphElementList
  = head:SubgraphStatement tail:(_ SubgraphStatement)* {
      const result = [head];
      for (let i = 0; i < tail.length; i++) {
        if (tail[i][1]) {
          result.push(tail[i][1]);
        }
      }
      return result;
    }
  / _ { return []; }

SubgraphStatement
  = Comment
  / DeploymentNode
  / BoundaryBlock
  / Subgraph
  / ElementCall
  / Element
  / Relationship
  / DirectionStatement

DirectionStatement
  = "direction" _ dir:Direction {
      return { type: 'style', direction: dir, loc: location() };
  }

// NEW RULES IMPLEMENTATION

DeploymentNode
  = NestEnter node:DeploymentNodeBody NestLeave { return node; }
  / NestUndo

DeploymentNodeBody
  = "Node" _ props:NodeProps _ NestOpen _ elements:SubgraphElementList _ "}" {
      const childrenElements = elements.filter(function(el) { return el.type === 'element'; });
      const internalRels = elements.filter(function(el) { return el.type === 'relationship'; });
      // Anything else in the body is not drawn inside a node. Record it so the
      // model builder can say so (#472); comments carry no content to lose.
      const dropped = elements
        .filter(function(el) { return el.type === 'boundary' || el.type === 'style'; })
        .map(function(el) {
          const kind = el.type === 'style' ? 'direction'
            : (el.boundaryType ? el.boundaryType : 'subgraph');
          return { kind: kind, loc: el.loc };
        });

      return withAttributeCount({
        type: 'element',
        id: props.id,
        label: props.label,
        elementType: 'node',
        technology: props.technology,
        description: props.description,
        tags: props.tags,
        sprite: props.sprite,
        code: props.code,
        metadata: props.metadata,
        ...props.style,
        children: childrenElements,
        internalRelationships: internalRels,
        ...(dropped.length > 0 ? { droppedConstructs: dropped } : {}),
        loc: location()
      }, props.attributeCount);
    }

NodeProps
  = "(" _ id:Identifier _ "," _ label:QuotedString _ args:ElementCallArgs _ ")" {
      return { 
        id: id, 
        label: label, 
        technology: args.technology, 
        description: args.description, 
        tags: args.tags, 
        sprite: args.sprite,
        code: args.code,
        metadata: args.metadata,
        style: args.style,
        attributeCount: args.attributeCount
      };
    }
  / label:QuotedString _ technology:QuotedString? _ kv:KVArgs? {
      const id = label.replace(/[^a-zA-Z0-9]/g, '');
      const kvMap = kv || {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      // Extract known keys
      const knownKeys = ['tags', 'sprite', 'code', 'shape'];
      const metadata = {};
      Object.keys(kvMap).forEach(key => {
        if (!knownKeys.includes(key)) metadata[key] = kvMap[key];
      });

      return { 
        id: id, 
        label: label, 
        technology: technology || undefined, 
        tags: tags, 
        sprite: kvMap.sprite,
        code: kvMap.code,
        metadata: metadata,
        style: styleFields(kvMap),
        attributeCount: attributeCount(kvMap)
      };
    }

ElementCall
  = type:Identifier _ "(" _ id:Identifier _ "," _ label:QuotedString _ args:ElementCallArgs _ ")" {
      return withAttributeCount({
        type: 'element',
        id: id,
        label: label,
        elementType: type,
        technology: args.technology,
        description: args.description,
        tags: args.tags,
        sprite: args.sprite,
        code: args.code,
        metadata: args.metadata,
        ...args.style,
        children: args.children, // If any? (DeploymentNode logic is separate)
        loc: location()
      }, args.attributeCount);
    }

ElementCallArgs
  = technology:(_ "," _ QuotedString)? description:(_ "," _ QuotedString)? kv:(_ "," _ KVArgs)? {
      const tech = technology ? technology[3] : undefined;
      const desc = description ? description[3] : undefined;
      const kvMap = kv ? kv[3] : {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      
      // $code is kept raw here; C4ModelBuilder splits and validates it.
      const knownKeys = ['tags', 'sprite', 'code', 'shape'];
      const metadata = {};
      Object.keys(kvMap).forEach(key => {
        if (!knownKeys.includes(key)) metadata[key] = kvMap[key];
      });

      return {
          technology: tech,
          description: desc,
          tags: tags,
          sprite: kvMap.sprite,
          code: kvMap.code,
          metadata: metadata,
          style: styleFields(kvMap),
          attributeCount: attributeCount(kvMap)
      };
  }

KVArgs
  = head:KVPair tail:(_ "," _ KVPair)* {
      const result = {};
      const duplicates = [];
      const locations = {};
      result[head.key] = head.value;
      locations[head.key] = head.loc;
      for (let i = 0; i < tail.length; i++) {
        const p = tail[i][3];
        if (p.key === 'code' && result.code !== undefined) {
          error('Duplicate $code attribute: list every glob in one value, e.g. $code="src/a/**, src/b.ts"');
        }
        if (Object.prototype.hasOwnProperty.call(result, p.key)) {
          duplicates.push({ key: p.key, loc: p.loc });
        }
        result[p.key] = p.value;
        locations[p.key] = p.loc;
      }
      result[DUPLICATE_KEYS] = duplicates;
      result[KEY_LOCATIONS] = locations;
      result[ATTRIBUTE_COUNT] = 1 + tail.length;
      return result;
  }

KVPair
  = "$" key:Identifier _ "=" _ value:Value {
      return { key: key, value: value, loc: location() };
  }


Value
  = QuotedString
  / DottedIdentifier

DottedIdentifier
  = head:Identifier tail:("." Identifier)* {
      const parts = [head, ...tail.map(t => t[1])];
      // If starts with c4xicons, strip it? Or just return the whole string?
      // User wants 'c4xicons.gcp...', likely mapping to 'gcp...'.
      // For now, let's return it as a string. The renderer/resolver handles semantic meaning.
      // BUT, if we want to support 'c4xicons.aws-s3', passing 'c4xicons.aws-s3' to the sprite lookup will fail unless we handle it.
      // Let's strip 'c4xicons.' if present here? No, parser should be dumb.
      return parts.join('.');
  }

// END NEW RULES

QuotedString
  = "\"" chars:(!("\"") .)* "\"" { return chars.map(function(c) { return c[1]; }).join(''); }

Element
  = id:Identifier _ "[" _ body:ElementBody _ "]" _ kv:KVArgs? {
      if (body.length < 2) {
        const err = new Error("Elements must include label and type");
        err.location = location();
        throw err;
      }
      const label = body[0].trim();
      const type = body[1].trim();
      const tags = body.slice(2).map(function(l) { return l.trim(); }).filter(Boolean);

      const kvMap = kv || {};
      const knownKeys = ['tags', 'sprite', 'code', 'shape'];
      const metadata = {};
      Object.keys(kvMap).forEach(key => {
        if (!knownKeys.includes(key)) metadata[key] = kvMap[key];
      });

      return withAttributeCount({
        type: 'element',
        id: id,
        label: label,
        elementType: type,
        tags: tags,
        sprite: kvMap.sprite,
        code: kvMap.code,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        ...styleFields(kvMap),
        loc: location()
      }, attributeCount(kvMap));
    }

ElementBody
  = head:ElementLine tail:(Break ElementLine)* {
      const lines = [head];
      for (let i = 0; i < tail.length; i++) {
        lines.push(tail[i][1]);
      }
      return lines;
    }

ElementLine
  = chars:(!("\n" / "[" / "]" / "<br/>") .)+ { return chars.map(function(c) { return c[1]; }).join('').trim(); }

Relationship
  = from:Identifier _ arrow:Arrow _ label:RelationshipLabel? _ technology:RelationshipTechnology? _ to:Identifier {
      const result = { type: 'relationship', from: from, arrow: arrow, label: label != null ? label.trim() : '', to: to, loc: location() };
      if (technology != null) {
        result.technology = technology;
      }
      return result;
    }

RelationshipLabel
  = "|" chars:(!"|" .)* "|" { return chars.map(function(c) { return c[1]; }).join(''); }

RelationshipTechnology
  = "\"" chars:(!"\"" .)* "\"" { return chars.map(function(c) { return c[1]; }).join(''); }

// Nesting bookkeeping (see the per-parse initializer). NestEnter and NestLeave
// bracket a nesting rule; NestUndo runs only when its body failed, restoring
// the count before the rule itself fails.
NestEnter
  = &{ nestDepth++; return true; }

NestLeave
  = &{ nestDepth--; return true; }

NestUndo
  = &{ nestDepth--; return false; } .  // never matches; the "." tells Peggy's loop check this alternative consumes input

NestOpen
  = "{" &{
      if (nestDepth > maxNestingDepth) {
        // Reported at the brace itself, one column back from here.
        const here = location();
        const at = { offset: here.start.offset - 1, line: here.start.line, column: here.start.column - 1 };
        error('Nesting is deeper than ' + maxNestingDepth + ' levels. C4X allows at most ' + maxNestingDepth + ' nested boundaries, nodes and subgraphs.',
          { source: here.source, start: at, end: here.start });
      }
      return true;
    }

Arrow
  = "-->" / "-.->" / "==>"

Identifier
  = $([a-zA-Z_][a-zA-Z0-9_\-]*)

Break
  = _ "<br/>" _

_
  = (Whitespace / Newline)*

__
  = (Whitespace / Newline)+

Whitespace
  = [ \t\r]+

Newline
  = "\n"