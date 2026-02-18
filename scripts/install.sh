#!/bin/bash

# =============================================================================
# Africa Payments MCP - One-Line Installer
# =============================================================================
# This script detects your OS, checks Node.js version, installs the package,
# and runs the interactive setup.
#
# Quick Install:
#   curl -fsSL https://raw.githubusercontent.com/kenyaclaw/africa-payments-mcp/main/scripts/install.sh | bash
#
# Or with wget:
#   wget -qO- https://raw.githubusercontent.com/kenyaclaw/africa-payments-mcp/main/scripts/install.sh | bash
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Emoji helpers
ROCKET="🚀"
CHECK="✅"
CROSS="❌"
WARNING="⚠️"
INFO="ℹ️"
GLOBE="🌍"
PACKAGE="📦"
GEAR="⚙️"
PARTY="🎉"

# Global variables
MIN_NODE_VERSION=18
INSTALL_METHOD=""
PACKAGE_NAME="@kenyaclaw/africa-payments-mcp"

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  ${GLOBE} Africa Payments MCP - Installation${NC}"
    echo -e "${CYAN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}${CHECK} $1${NC}"
}

print_error() {
    echo -e "${RED}${CROSS} $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}${WARNING} $1${NC}"
}

print_info() {
    echo -e "${BLUE}${INFO} $1${NC}"
}

print_step() {
    echo -e "${MAGENTA}${GEAR} $1...${NC}"
}

# =============================================================================
# OS Detection
# =============================================================================

detect_os() {
    print_step "Detecting operating system"
    
    OS="unknown"
    OS_TYPE=""
    
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS_TYPE="$NAME"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="mac"
        OS_TYPE="macOS $(sw_vers -productVersion)"
    elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
        OS="windows"
        OS_TYPE="Windows (Git Bash/Cygwin)"
    elif [[ -n "$WSL_DISTRO_NAME" ]] || grep -q Microsoft /proc/version 2>/dev/null; then
        OS="wsl"
        OS_TYPE="Windows WSL ($WSL_DISTRO_NAME)"
    fi
    
    print_success "Detected: $OS_TYPE"
    
    # Warn about Windows without WSL
    if [[ "$OS" == "windows" ]]; then
        echo ""
        print_warning "Windows detected without WSL"
        echo "    For best experience, we recommend using WSL2:"
        echo "    https://docs.microsoft.com/en-us/windows/wsl/install"
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# =============================================================================
# Node.js Version Check
# =============================================================================

check_nodejs() {
    print_step "Checking Node.js installation"
    
    if ! command -v node &> /dev/null; then
        echo ""
        print_error "Node.js is not installed"
        echo ""
        echo -e "${BOLD}Please install Node.js ${MIN_NODE_VERSION}+ from:${NC}"
        echo "  • Official: https://nodejs.org/"
        echo "  • Using nvm: https://github.com/nvm-sh/nvm"
        echo ""
        
        # Offer to install via package manager
        if [[ "$OS" == "mac" ]]; then
            echo "Or install via Homebrew:"
            echo "  brew install node@$MIN_NODE_VERSION"
        elif [[ "$OS" == "linux" ]]; then
            if command -v apt-get &> /dev/null; then
                echo "Or install via apt:"
                echo "  curl -fsSL https://deb.nodesource.com/setup_${MIN_NODE_VERSION}.x | sudo -E bash -"
                echo "  sudo apt-get install -y nodejs"
            elif command -v yum &> /dev/null; then
                echo "Or install via yum:"
                echo "  curl -fsSL https://rpm.nodesource.com/setup_${MIN_NODE_VERSION}.x | sudo bash -"
                echo "  sudo yum install -y nodejs"
            fi
        fi
        
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1)
    
    print_success "Node.js found: v${NODE_VERSION}"
    
    if [ "$NODE_MAJOR" -lt "$MIN_NODE_VERSION" ]; then
        echo ""
        print_error "Node.js v${NODE_VERSION} is too old (minimum: v${MIN_NODE_VERSION})"
        echo ""
        echo -e "${BOLD}Upgrade options:${NC}"
        echo "  1. Download from https://nodejs.org/"
        if command -v nvm &> /dev/null; then
            echo "  2. Use nvm: nvm install $MIN_NODE_VERSION && nvm use $MIN_NODE_VERSION"
        fi
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed (should come with Node.js)"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    print_success "npm found: v${NPM_VERSION}"
}

# =============================================================================
# Check if already installed
# =============================================================================

check_existing_installation() {
    if command -v africa-payments-mcp &> /dev/null; then
        EXISTING_VERSION=$(africa-payments-mcp --version 2>/dev/null || echo "unknown")
        echo ""
        print_warning "Africa Payments MCP is already installed (v${EXISTING_VERSION})"
        echo ""
        read -p "Reinstall/Update? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo ""
            print_info "Skipping installation"
            echo ""
            echo -e "${BOLD}Quick commands:${NC}"
            echo "  africa-payments-mcp init      # Run configuration wizard"
            echo "  africa-payments-mcp doctor    # Check installation health"
            echo ""
            exit 0
        fi
    fi
}

# =============================================================================
# Installation
# =============================================================================

install_package() {
    echo ""
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}${BOLD}  ${PACKAGE} Installing Package${NC}"
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    # Detect install method preference
    if command -v npm &> /dev/null; then
        INSTALL_METHOD="npm"
    fi
    
    # Check if user wants global or local install
    echo -e "${BOLD}Choose installation type:${NC}"
    echo "  1) Global (recommended) - Available system-wide"
    echo "  2) Local - Install in current directory"
    echo ""
    read -p "Select option [1]: " INSTALL_TYPE
    INSTALL_TYPE=${INSTALL_TYPE:-1}
    
    if [ "$INSTALL_TYPE" == "2" ]; then
        # Local install
        print_step "Installing locally with npm"
        npm install "$PACKAGE_NAME"
        
        # Create a wrapper script
        cat > africa-payments-mcp << 'EOF'
#!/bin/bash
./node_modules/.bin/africa-payments-mcp "$@"
EOF
        chmod +x africa-payments-mcp
        
        print_success "Installed locally"
        print_info "Use: ./africa-payments-mcp"
    else
        # Global install
        print_step "Installing globally with npm"
        
        # Check if we need sudo (Unix-like systems)
        NEED_SUDO=false
        if [[ "$OS" != "windows" ]]; then
            NPM_PREFIX=$(npm config get prefix)
            if [ ! -w "$NPM_PREFIX" ] && [ ! -w "$NPM_PREFIX/bin" ] 2>/dev/null; then
                NEED_SUDO=true
            fi
        fi
        
        if [ "$NEED_SUDO" = true ]; then
            print_warning "Global npm packages require elevated permissions"
            echo "Running: sudo npm install -g $PACKAGE_NAME"
            echo ""
            sudo npm install -g "$PACKAGE_NAME"
        else
            npm install -g "$PACKAGE_NAME"
        fi
        
        print_success "Installed globally"
    fi
}

# =============================================================================
# Post-installation Setup
# =============================================================================

run_setup() {
    echo ""
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}${BOLD}  ${GEAR} Configuration${NC}"
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    echo -e "${BOLD}Would you like to run the interactive setup wizard?${NC}"
    echo "This will help you configure your payment providers."
    echo ""
    read -p "Run setup wizard? (Y/n) " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        echo ""
        if command -v africa-payments-mcp &> /dev/null; then
            africa-payments-mcp init
        else
            ./africa-payments-mcp init
        fi
    else
        echo ""
        print_info "Skipping setup wizard"
        echo ""
        echo -e "${BOLD}You can run it later with:${NC}"
        echo "  africa-payments-mcp init"
    fi
}

# =============================================================================
# Auto-detect Environment
# =============================================================================

run_auto_detect() {
    echo ""
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo -e "${CYAN}${BOLD}  ${INFO} Auto-Detecting Credentials${NC}"
    echo -e "${CYAN}${BOLD}───────────────────────────────────────────────────────────────${NC}"
    echo ""
    
    # Check for environment variables
    DETECTED=0
    
    if env | grep -q "^MPESA_"; then
        print_success "Found M-Pesa environment variables"
        DETECTED=$((DETECTED + 1))
    fi
    
    if env | grep -q "^PAYSTACK_"; then
        print_success "Found Paystack environment variables"
        DETECTED=$((DETECTED + 1))
    fi
    
    if env | grep -q "^MOMO_\|^MTN_MOMO_"; then
        print_success "Found MTN MoMo environment variables"
        DETECTED=$((DETECTED + 1))
    fi
    
    if env | grep -q "^INTASEND_"; then
        print_success "Found IntaSend environment variables"
        DETECTED=$((DETECTED + 1))
    fi
    
    # Check for config files
    if [ -f "config.json" ]; then
        print_success "Found config.json in current directory"
        DETECTED=$((DETECTED + 1))
    fi
    
    if [ -f "$HOME/.africa-payments/config.json" ]; then
        print_success "Found config in ~/.africa-payments/"
        DETECTED=$((DETECTED + 1))
    fi
    
    if [ -f ".env" ]; then
        print_success "Found .env file"
        DETECTED=$((DETECTED + 1))
    fi
    
    if [ $DETECTED -eq 0 ]; then
        echo ""
        print_info "No existing credentials found"
        echo ""
        echo -e "${BOLD}Next steps:${NC}"
        echo "  1. Get your API keys from payment providers"
        echo "  2. Run: africa-payments-mcp init"
        echo ""
    else
        echo ""
        print_success "Found $DETECTED configuration source(s)"
        echo ""
        echo -e "${BOLD}To use auto-detected credentials:${NC}"
        echo "  africa-payments-mcp detect"
        echo ""
    fi
}

# =============================================================================
# Print Success Message
# =============================================================================

print_completion() {
    INSTALLED_VERSION=$(africa-payments-mcp --version 2>/dev/null || echo "installed")
    
    echo ""
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  ${PARTY} Installation Complete! ${PARTY}${NC}"
    echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${BOLD}Africa Payments MCP ${INSTALLED_VERSION}${NC}"
    echo ""
    echo -e "${CYAN}Quick Start:${NC}"
    echo "  africa-payments-mcp --help           # Show all commands"
    echo "  africa-payments-mcp init             # Run configuration wizard"
    echo "  africa-payments-mcp detect           # Auto-detect credentials"
    echo "  africa-payments-mcp doctor           # Check installation health"
    echo "  africa-payments-mcp validate -c config.json  # Validate config"
    echo ""
    echo -e "${CYAN}Documentation:${NC}"
    echo "  https://docs.africapayments.dev"
    echo "  https://github.com/kenyaclaw/africa-payments-mcp"
    echo ""
    echo -e "${CYAN}Get Help:${NC}"
    echo "  GitHub Issues: https://github.com/kenyaclaw/africa-payments-mcp/issues"
    echo "  Discord: https://discord.gg/africapayments"
    echo ""
    echo -e "${GREEN}${BOLD}Built with ${GLOBE} for African fintech${NC}"
    echo ""
}

# =============================================================================
# Main
# =============================================================================

main() {
    print_header
    
    detect_os
    check_nodejs
    check_existing_installation
    install_package
    run_auto_detect
    run_setup
    print_completion
}

# Handle script interruption
trap 'echo; print_error "Installation interrupted"; exit 1' INT

# Run main function
main "$@"
