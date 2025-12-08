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
              // Recursively add children elements to the flat list for lookups/styling
              if (stmt.children) {
                 // We need to process children to separate relationships/elements if strictly flattening,
                 // but for the parser output, we want the tree structure in the element.
                 // However, we might want to collect all relationships globally?
                 // The current logic collects relationships into a global list.
                 // If a DeploymentNode has relationships inside it, we should extract them?
                 // DeploymentNode children are 'elements' (nodes/containers).
                 // What if a relationship is defined INSIDE a Node block?
                 // "Node ... { A -> B }"
                 // Yes, we should extract relationships.
                 
                 // stmt.children contains statements (Elements, Relationships, etc.)?
                 // My DeploymentNode rule filters: children: elements.filter(el => el.type === 'element')
                 // Only elements are kept as children of the node.
                 // Relationships inside the block are lost if I filter them out!
                 // I need to change DeploymentNode rule to return relationships too?
                 // Or separate them.
                 
                 // Let's refine DeploymentNode rule.
              }
            } else if (stmt.type === 'relationship') {
              relationships.push(stmt);
            } else if (stmt.type === 'boundary') {
              boundaries.push(stmt);
              if (stmt.elements) {
                elements.push(...stmt.elements);
              }
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

      // Helper to traverse tree and extract relationships/flat elements if needed
      // But wait, the existing logic for 'boundary' (Subgraph) flattens:
      // elements.push(...stmt.elements)
      // relationships.push(...stmt.relationships)
      // And 'boundary' object ITSELF is pushed to 'boundaries'.
      
      // For DeploymentNode, it is an 'element' (type='element', elementType='node').
      // It is pushed to 'elements'.
      // Its children are in 'stmt.children'.
      // Should we flatten its children into 'elements' too?
      // If we do, they will be rendered at top level?
      // No, the renderer iterates 'elements'.
      // If 'elements' contains both Parent and Child, the renderer might duplicate or get confused?
      // Existing Subgraph logic: 'boundaries' contains the grouping. 'elements' contains the items.
      // The renderer probably renders boundaries and places elements inside.
      
      // For DeploymentNode, it's an element that contains elements.
      // If I want the renderer to handle recursion, maybe I should NOT flatten them?
      // But 'relationships' need to be global.
      
      // Let's stick to the plan:
      // DeploymentNode is an element.
      // Its children are properties of that element.
      // Any RELATIONSHIPS defined inside the Node block must be extracted to the global 'relationships' list.
      // So DeploymentNode rule needs to return { element: ..., relationships: ... }?
      // Or I handle it in Start rule traversing?
      
      // PEG.js actions run bottom-up.
      // If DeploymentNode returns just the Element object, the relationships inside it are lost if I filter them out.
      
      // Modified DeploymentNode rule:
      // Return { type: 'element', ..., children: ..., internalRelationships: ... }
      // And in Start, we extract internalRelationships.
      
      processStatements(statements);
      
      // We need to handle nested relationships in DeploymentNodes
      const extractNested = (stmts) => {
          for (const stmt of stmts) {
              if (stmt.type === 'element' && stmt.internalRelationships) {
                  relationships.push(...stmt.internalRelationships);
                  delete stmt.internalRelationships; // Clean up
                  if (stmt.children) {
                      extractNested(stmt.children);
                  }
              }
          }
      }
      extractNested(elements);

      const elementMap = new Map();
      // Only map top-level or all?
      // We need all elements in the map for class assignments.
      // A flatten helper?
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
      const allElements = flattenElements(elements);

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
      return { 
        type: 'boundary', 
        label: label, 
        boundaryType: type,
        elements: elements.filter(function(el) { return el.type === 'element'; }),
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
      return {
        type: 'boundary',
        label: label,
        elements: elements.filter(function(el) { return el.type === 'element'; }),
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
  / ElementCall
  / Element
  / Relationship

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
        sprite: args.sprite 
      };
    }
  / label:QuotedString _ technology:QuotedString? _ kv:KVArgs? {
      const id = label.replace(/[^a-zA-Z0-9]/g, '');
      const kvMap = kv || {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      return { 
        id: id, 
        label: label, 
        technology: technology || undefined, 
        tags: tags, 
        sprite: kvMap.sprite 
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
        sprite: args.sprite
      };
    }

ElementCallArgs
  = technology:(_ "," _ QuotedString)? description:(_ "," _ QuotedString)? kv:(_ "," _ KVArgs)? {
      const tech = technology ? technology[3] : undefined;
      const desc = description ? description[3] : undefined;
      const kvMap = kv ? kv[3] : {};
      const tags = kvMap.tags ? kvMap.tags.split(',').map(t => t.trim()) : [];
      
      return {
          technology: tech,
          description: desc,
          tags: tags,
          sprite: kvMap.sprite
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