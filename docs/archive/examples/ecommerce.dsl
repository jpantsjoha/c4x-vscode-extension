/**
 * E-Commerce Platform - Structurizr DSL Example
 * Demonstrates Structurizr DSL syntax support in C4Model VSCode Extension
 */

workspace "E-Commerce Platform" {
    model {
        // External actors
        customer = person "Customer" {
            "A customer of the e-commerce platform who browses and purchases products"
        }

        admin = person "Administrator" {
            "System administrator who manages products, orders, and users"
        }

        // Main software system with nested containers
        ecommerce = softwareSystem "E-Commerce System" {
            "Enables customers to browse products, place orders, and make payments"

            // Frontend container
            web = container "Web Application" {
                "Provides e-commerce functionality via web browser"
                "React + TypeScript"
            }

            // API Gateway
            api = container "API Gateway" {
                "Provides REST API for frontend applications"
                "Node.js + Express"
            }

            // Microservices
            catalog = container "Product Catalog Service" {
                "Manages product information, categories, and search"
                "Java + Spring Boot"
            }

            orders = container "Order Service" {
                "Handles order creation, processing, and fulfillment"
                "Java + Spring Boot"
            }

            users = container "User Service" {
                "Manages user accounts, authentication, and profiles"
                "Java + Spring Boot"
            }

            // Data stores
            db = container "Primary Database" {
                "Stores product, order, and user data"
                "PostgreSQL"
            }

            cache = container "Cache" {
                "Caches frequently accessed data"
                "Redis"
            }
        }

        // External systems
        payment = softwareSystem "Payment Gateway" {
            "External payment processing service (Stripe, PayPal)"
        }

        shipping = softwareSystem "Shipping Provider" {
            "External shipping and logistics service"
        }

        email = softwareSystem "Email Service" {
            "Transactional email service (SendGrid, SES)"
        }

        // Customer relationships
        customer -> web "Browses products, places orders, and makes payments using"
        web -> api "Makes API calls to" "HTTPS/JSON"

        // Admin relationships
        admin -> web "Manages products, orders, and users via"

        // API Gateway relationships
        api -> catalog "Routes product requests to" "REST/JSON"
        api -> orders "Routes order requests to" "REST/JSON"
        api -> users "Routes user requests to" "REST/JSON"
        api -> cache "Reads cached data from" "Redis Protocol"

        // Service relationships
        catalog -> db "Reads from and writes to" "JDBC"
        orders -> db "Reads from and writes to" "JDBC"
        users -> db "Reads from and writes to" "JDBC"

        catalog -> cache "Writes product data to" "Redis Protocol"
        orders -> cache "Writes order data to" "Redis Protocol"

        // External system relationships
        orders -> payment "Processes payments via" "HTTPS"
        orders -> shipping "Arranges shipping via" "HTTPS"
        orders -> email "Sends order confirmations via" "SMTP"
        users -> email "Sends account emails via" "SMTP"
    }

    views {
        // System Context View - Shows the system and its external dependencies
        systemContext ecommerce "SystemContext" {
            include *
        }

        // Container View - Shows the internal containers/services
        container ecommerce "Containers" {
            include *
        }

        // Component View - Example for Product Catalog Service
        // (Note: components not defined in this example, but syntax is supported)
        // component catalog "CatalogComponents" {
        //     include *
        // }
    }

    styles {
        // Person styling
        element "Person" {
            background #08427B
            color #FFFFFF
            shape Person
        }

        // Software System styling
        element "Software System" {
            background #1168BD
            color #FFFFFF
        }

        // Container styling
        element "Container" {
            background #438DD5
            color #FFFFFF
        }

        // Database styling
        element "Database" {
            background #438DD5
            color #FFFFFF
            shape Cylinder
        }

        // External system styling
        element "External" {
            background #999999
            color #FFFFFF
        }

        // Relationship styling
        relationship "Synchronous" {
            color #707070
            thickness 2
            style Solid
        }

        relationship "Asynchronous" {
            color #FF6600
            thickness 2
            style Dashed
        }
    }
}
