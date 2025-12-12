Start
  = _ directive:Directive? _ GraphKeyword _ direction:Direction _ statements:StatementList _ {
      const viewType = directive != null ? directive : 'system-context';
      const elements = [];
      const relationships = [];
      const boundaries = [];
      const classDefinitions = [];
      const classAssignments = [];
      
      const processStatements = (stmts) => {
          for (const stmt of stmts) {
            if (stmt.type === 'element') {
              elements.push(stmt);
              if (stmt.internalRelationships) {
                // DeploymentNodes might have internal relationships
                 relationships.push(...stmt.internalRelationships);
              }
              if (stmt.children) {
                  // recurse for DeploymentNode children
                  processStatements(stmt.children);
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
            }
          }
      };

      processStatements(statements);
      
      // Cleanup: Boundaries should only contain Elements in their 'elements' array for the Builder.
      // We remove nested boundaries from the 'elements' property of the boundary object itself,
      // as they are already flattened into the global 'boundaries' list.
      // (This assumes the renderer doesn't need tree structure in the boundary object itself)
      for (const b of boundaries) {
          if (b.elements) {
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
      return { viewType, elements, relationships, boundaries, classDefinitions };
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
  / Subgraph
  / DeploymentNode
  / BoundaryBlock
  / ElementCall
  / Element
  / Relationship

Title
  = "title" _ [^\n]* { return { type: 'comment' }; }

BoundaryBlock
  = type:BoundaryType _ "(" _ id:Identifier _ "," _ label:QuotedString _ ")" _ "{" _ elements:SubgraphElementList _ "}" {
      const dirStmt = elements.find(function(el) { return el.type === 'style'; });
      // Include nested boundaries in 'elements' so the Start rule can traverse them
      return { 
        type: 'boundary', 
        id: id,
        label: label, 
        boundaryType: type,
        direction: dirStmt ? dirStmt.direction : undefined,
        elements: elements.filter(function(el) { return el.type === 'element' || el.type === 'boundary'; }),
        relationships: elements.filter(function(el) { return el.type === 'relationship'; })
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
  = "subgraph" _ label:Identifier _ "{" _ elements:SubgraphElementList _ "}" _ {
      const dirStmt = elements.find(function(el) { return el.type === 'style'; });
      return {
        type: 'boundary',
        label: label,
        direction: dirStmt ? dirStmt.direction : undefined,
        elements: elements.filter(function(el) { return el.type === 'element' || el.type === 'boundary'; }),
        relationships: elements.filter(function(el) { return el.type === 'relationship'; })
      };
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
      return { type: 'style', direction: dir };
  }

// NEW RULES IMPLEMENTATION

DeploymentNode
  = "Node" _ props:NodeProps _ "{" _ elements:SubgraphElementList _ "}" {
      const childrenElements = elements.filter(function(el) { return el.type === 'element'; });
      const internalRels = elements.filter(function(el) { return el.type === 'relationship'; });

      return { 
        type: 'element', 
        id: props.id, 
        label: props.label, 
        elementType: 'node',
        technology: props.technology,
        description: props.description,
        tags: props.tags,
        sprite: props.sprite,
        metadata: props.metadata,
        children: childrenElements,
        internalRelationships: internalRels
      };
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
        metadata: args.metadata
      };
    }
  / label:QuotedString _ technology:QuotedString? _ kv:KVArgs? {
      const id = label.replace(/[^a-zA-Z0-9]/g, '');
      const kvMap = kv || {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      // Extract known keys
      const knownKeys = ['tags', 'sprite'];
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
        metadata: metadata
      };
    }

ElementCall
  = type:Identifier _ "(" _ id:Identifier _ "," _ label:QuotedString _ args:ElementCallArgs _ ")" {
      return {
        type: 'element',
        id: id,
        label: label,
        elementType: type,
        technology: args.technology,
        description: args.description,
        tags: args.tags,
        sprite: args.sprite,
        metadata: args.metadata,
        children: args.children // If any? (DeploymentNode logic is separate)
      };
    }

ElementCallArgs
  = technology:(_ "," _ QuotedString)? description:(_ "," _ QuotedString)? kv:(_ "," _ KVArgs)? {
      const tech = technology ? technology[3] : undefined;
      const desc = description ? description[3] : undefined;
      const kvMap = kv ? kv[3] : {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      
      const knownKeys = ['tags', 'sprite'];
      const metadata = {};
      Object.keys(kvMap).forEach(key => {
        if (!knownKeys.includes(key)) metadata[key] = kvMap[key];
      });

      return {
          technology: tech,
          description: desc,
          tags: tags,
          sprite: kvMap.sprite,
          metadata: metadata
      };
  }

KVArgs
  = head:KVPair tail:(_ "," _ KVPair)* {
      const result = {};
      result[head.key] = head.value;
      for (let i = 0; i < tail.length; i++) {
        const p = tail[i][3];
        result[p.key] = p.value;
      }
      return result;
  }

KVPair
  = "$" key:Identifier _ "=" _ value:QuotedString {
      return { key: key, value: value };
  }

// END NEW RULES

QuotedString
  = "\"" chars:(!("\"") .)* "\"" { return chars.map(function(c) { return c[1]; }).join(''); }

Element
  = id:Identifier _ "[" _ body:ElementBody _ "]" {
      if (body.length < 2) {
        const err = new Error("Elements must include label and type");
        err.location = location();
        throw err;
      }
      const label = body[0].trim();
      const type = body[1].trim();
      const tags = body.slice(2).map(function(l) { return l.trim(); }).filter(Boolean);
      return { type: 'element', id: id, label: label, elementType: type, tags: tags };
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
  = from:Identifier _ arrow:Arrow _ label:RelationshipLabel? _ to:Identifier {
      return { type: 'relationship', from: from, arrow: arrow, label: label != null ? label.trim() : '', to: to };
    }

RelationshipLabel
  = "|" chars:(!"|" .)* "|" { return chars.map(function(c) { return c[1]; }).join(''); }

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