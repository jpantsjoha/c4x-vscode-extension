workspace {
    model {
        user = person "User" "A user of the banking system."
        softwareSystem = softwareSystem "Banking System" "Main banking platform."
        
        user -> softwareSystem "Uses"
    }
    views {
        systemContext softwareSystem "SystemContext" {
            include *
            autolayout tb
        }
    }
}
