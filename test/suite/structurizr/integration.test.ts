/**
 * Structurizr DSL Integration Tests
 * Tests for complete pipeline: Source → Lexer → Parser → Adapter → C4Model
 */

import * as assert from 'assert';
import { parseStructurizrDSL } from '../../../src/parser/structurizr';
import { C4Model } from '../../../src/model/C4Model';

describe('Structurizr DSL Integration', () => {
    describe('Complete Pipeline', () => {
        it('should parse simple workspace end-to-end', () => {
            const source = `workspace "My Workspace" {
                model {
                    user = person "User"
                    sys = softwareSystem "System"
                    user -> sys "Uses"
                }
                views {
                    systemContext sys "diagram" {
                        include *
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            assert.strictEqual(model.workspace, 'My Workspace');
            assert.strictEqual(model.views.length, 1);
            assert.strictEqual(model.views[0].elements.length, 2);
            assert.strictEqual(model.views[0].relationships.length, 1);
        });

        it('should handle nested elements correctly', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System" {
                        web = container "Web Application" {
                            ctrl = component "Controller"
                            svc = component "Service"
                        }
                        api = container "API"
                    }
                }
                views {
                    component web "components" {
                        include *
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            // Component view should show web + ctrl + svc
            const view = model.views[0];
            assert.strictEqual(view.type, 'component');
            assert.strictEqual(view.elements.length, 3);

            const ids = view.elements.map(e => e.id);
            assert.ok(ids.includes('web'));
            assert.ok(ids.includes('ctrl'));
            assert.ok(ids.includes('svc'));
        });

        it('should apply filters correctly', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    admin = person "Admin"
                    sys1 = softwareSystem "System 1"
                    sys2 = softwareSystem "System 2"

                    user -> sys1 "Uses"
                    admin -> sys1 "Administers"
                    sys1 -> sys2 "Integrates with"
                }
                views {
                    systemContext sys1 "diagram" {
                        include user sys1
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            const view = model.views[0];

            // Should only include user and sys1
            assert.strictEqual(view.elements.length, 2);

            const ids = view.elements.map(e => e.id);
            assert.ok(ids.includes('user'));
            assert.ok(ids.includes('sys1'));
            assert.ok(!ids.includes('admin'));
            assert.ok(!ids.includes('sys2'));

            // Should only include user -> sys1 relationship
            assert.strictEqual(view.relationships.length, 1);
            assert.strictEqual(view.relationships[0].from, 'user');
            assert.strictEqual(view.relationships[0].to, 'sys1');
        });
    });

    describe('Real-World Examples', () => {
        it('should parse e-commerce system example', () => {
            const source = `workspace "E-Commerce Platform" {
                model {
                    customer = person "Customer" {
                        "A customer of the e-commerce platform"
                    }

                    admin = person "Administrator"

                    ecommerce = softwareSystem "E-Commerce System" {
                        web = container "Web Application" {
                            "Frontend web application"
                            "React + TypeScript"
                        }

                        api = container "API Gateway" {
                            "REST API"
                            "Node.js + Express"
                        }

                        catalog = container "Product Catalog Service" {
                            "Manages product catalog"
                            "Java + Spring Boot"
                        }

                        orders = container "Order Service" {
                            "Handles order processing"
                            "Java + Spring Boot"
                        }

                        db = container "Database" {
                            "Primary data store"
                            "PostgreSQL"
                        }
                    }

                    payment = softwareSystem "Payment Gateway" {
                        "External payment processing"
                    }

                    shipping = softwareSystem "Shipping Provider" {
                        "External shipping service"
                    }

                    customer -> web "Browses products and places orders"
                    admin -> web "Manages products and orders"
                    web -> api "Makes API calls" "HTTPS"
                    api -> catalog "Retrieves product information" "REST"
                    api -> orders "Creates and manages orders" "REST"
                    api -> db "Reads from and writes to" "JDBC"
                    api -> payment "Processes payments via" "HTTPS"
                    orders -> shipping "Arranges shipping via" "HTTPS"
                }

                views {
                    systemContext ecommerce "SystemContext" {
                        include *
                    }

                    container ecommerce "Containers" {
                        include *
                    }
                }

                styles {
                    element "Person" {
                        background #08427B
                        color #FFFFFF
                        shape Person
                    }

                    element "Container" {
                        background #438DD5
                        color #FFFFFF
                    }

                    element "Database" {
                        shape Cylinder
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            // Verify workspace
            assert.strictEqual(model.workspace, 'E-Commerce Platform');

            // Verify views
            assert.strictEqual(model.views.length, 2);

            // Verify system context view
            const contextView = model.views[0];
            assert.strictEqual(contextView.type, 'system-context');

            const contextIds = contextView.elements.map(e => e.id);
            assert.ok(contextIds.includes('customer'));
            assert.ok(contextIds.includes('admin'));
            assert.ok(contextIds.includes('ecommerce'));
            assert.ok(contextIds.includes('payment'));
            assert.ok(contextIds.includes('shipping'));

            // Verify container view
            const containerView = model.views[1];
            assert.strictEqual(containerView.type, 'container');

            const containerIds = containerView.elements.map(e => e.id);
            assert.ok(containerIds.includes('ecommerce'));
            assert.ok(containerIds.includes('web'));
            assert.ok(containerIds.includes('api'));
            assert.ok(containerIds.includes('catalog'));
            assert.ok(containerIds.includes('orders'));
            assert.ok(containerIds.includes('db'));

            // Verify relationships with technology
            const apiToDbRel = containerView.relationships.find(
                r => r.from === 'api' && r.to === 'db'
            );
            assert.ok(apiToDbRel);
            assert.strictEqual(apiToDbRel?.technology, 'JDBC');
        });

        it('should parse microservices example', () => {
            const source = `workspace "Microservices Architecture" {
                model {
                    user = person "User"

                    platform = softwareSystem "Platform" {
                        gateway = container "API Gateway"

                        auth = container "Auth Service" {
                            "Authentication and authorization"
                            "OAuth 2.0 + JWT"
                        }

                        users = container "User Service"
                        products = container "Product Service"
                        orders = container "Order Service"

                        messageQueue = container "Message Queue" {
                            "Asynchronous messaging"
                            "RabbitMQ"
                        }
                    }

                    user -> gateway "Makes requests"
                    gateway -> auth "Authenticates"
                    gateway -> users "User operations"
                    gateway -> products "Product operations"
                    gateway -> orders "Order operations"
                    orders -> messageQueue "Publishes events"
                }

                views {
                    container platform "Containers" {
                        include *
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            assert.strictEqual(model.workspace, 'Microservices Architecture');
            assert.strictEqual(model.views.length, 1);

            const view = model.views[0];
            assert.strictEqual(view.type, 'container');

            // Verify all microservices are included
            const ids = view.elements.map(e => e.id);
            assert.ok(ids.includes('gateway'));
            assert.ok(ids.includes('auth'));
            assert.ok(ids.includes('users'));
            assert.ok(ids.includes('products'));
            assert.ok(ids.includes('orders'));
            assert.ok(ids.includes('messageQueue'));
        });

        it('should parse banking system example', () => {
            const source = `workspace "Internet Banking System" {
                model {
                    customer = person "Personal Banking Customer"

                    banking = softwareSystem "Internet Banking System" {
                        web = container "Web Application"
                        mobile = container "Mobile App"
                        api = container "API Application"
                        db = container "Database"
                    }

                    mainframe = softwareSystem "Mainframe Banking System"
                    email = softwareSystem "E-mail System"

                    customer -> web "Uses"
                    customer -> mobile "Uses"
                    web -> api "Makes API calls to"
                    mobile -> api "Makes API calls to"
                    api -> db "Reads from and writes to"
                    api -> mainframe "Makes API calls to"
                    api -> email "Sends e-mail using"
                }

                views {
                    systemContext banking "SystemContext" {
                        include *
                    }

                    container banking "Containers" {
                        include *
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);

            assert.strictEqual(model.workspace, 'Internet Banking System');
            assert.strictEqual(model.views.length, 2);

            // System context should show external systems
            const contextView = model.views[0];
            const contextIds = contextView.elements.map(e => e.id);
            assert.ok(contextIds.includes('customer'));
            assert.ok(contextIds.includes('banking'));
            assert.ok(contextIds.includes('mainframe'));
            assert.ok(contextIds.includes('email'));

            // Container view should show internal containers
            const containerView = model.views[1];
            const containerIds = containerView.elements.map(e => e.id);
            assert.ok(containerIds.includes('web'));
            assert.ok(containerIds.includes('mobile'));
            assert.ok(containerIds.includes('api'));
            assert.ok(containerIds.includes('db'));
        });
    });

    describe('Comments and Formatting', () => {
        it('should handle line comments', () => {
            const source = `workspace "Test" {
                // This is a comment
                model {
                    // Another comment
                    user = person "User"
                }
                views {
                    systemContext user "diagram" { include * }
                }
            }`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.workspace, 'Test');
        });

        it('should handle block comments', () => {
            const source = `workspace "Test" {
                /*
                 * Multi-line block comment
                 * describing the workspace
                 */
                model {
                    user = person "User"
                }
                views {
                    systemContext user "diagram" { include * }
                }
            }`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.workspace, 'Test');
        });

        it('should handle various indentation styles', () => {
            const source = `workspace "Test" {
model {
    user = person "User"
        sys = softwareSystem "System"
}
    views {
systemContext sys "diagram" { include * }
    }
}`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.views.length, 1);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty model block', () => {
            const source = `workspace "Test" {
                model {
                }
                views {
                    systemContext sys "diagram" { include * }
                }
            }`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.workspace, 'Test');
        });

        it('should handle empty views block', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                }
                views {
                }
            }`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.views.length, 0);
        });

        it('should handle view with no include directive', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                }
                views {
                    systemContext user "diagram" {
                    }
                }
            }`;

            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.views.length, 1);
        });
    });
});
