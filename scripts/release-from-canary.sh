#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
CANARY_BRANCH="canary"
MAIN_BRANCH="main"

echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${BLUE}          Release from Canary - Cherry Pick Tool              ${NC}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Get the last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)
if [ -z "$LAST_TAG" ]; then
    echo -e "${RED}Error: No tags found in the repository${NC}"
    exit 1
fi

echo -e "${CYAN}Last tag:${NC} ${BOLD}$LAST_TAG${NC}"
echo ""

# Fetch latest changes
echo -e "${YELLOW}Fetching latest changes from remote...${NC}"
git fetch origin $CANARY_BRANCH $MAIN_BRANCH --quiet

# Get commits from canary since last tag
echo -e "${CYAN}Fetching commits from ${CANARY_BRANCH} since ${LAST_TAG}...${NC}"
CANARY_COMMITS=$(git log --oneline ${LAST_TAG}..origin/${CANARY_BRANCH} --no-merges 2>/dev/null)

# Get commits from main since last tag
echo -e "${CYAN}Fetching commits from ${MAIN_BRANCH} since ${LAST_TAG}...${NC}"
MAIN_COMMITS=$(git log --oneline ${LAST_TAG}..origin/${MAIN_BRANCH} --no-merges 2>/dev/null)

# Get commit hashes for comparison
CANARY_HASHES=$(git log --format="%H" ${LAST_TAG}..origin/${CANARY_BRANCH} --no-merges 2>/dev/null)
MAIN_HASHES=$(git log --format="%H" ${LAST_TAG}..origin/${MAIN_BRANCH} --no-merges 2>/dev/null)

# Find commits that are on canary but not on main (by commit message/patch-id to handle cherry-picks)
echo ""
echo -e "${BOLD}${YELLOW}Analyzing commits...${NC}"
echo ""

# Create temp files for patch-id comparison
CANARY_PATCHES=$(mktemp)
MAIN_PATCHES=$(mktemp)

# Get patch-ids for canary commits
for hash in $CANARY_HASHES; do
    patch_id=$(git show $hash | git patch-id --stable 2>/dev/null | cut -d' ' -f1)
    echo "$patch_id $hash" >> "$CANARY_PATCHES"
done

# Get patch-ids for main commits
for hash in $MAIN_HASHES; do
    patch_id=$(git show $hash | git patch-id --stable 2>/dev/null | cut -d' ' -f1)
    echo "$patch_id" >> "$MAIN_PATCHES"
done

# Find unique commits (on canary but not on main)
declare -a UNIQUE_COMMITS=()
declare -a UNIQUE_HASHES=()

while read -r line; do
    if [ -n "$line" ]; then
        patch_id=$(echo "$line" | cut -d' ' -f1)
        hash=$(echo "$line" | cut -d' ' -f2)
        
        if ! grep -q "^$patch_id$" "$MAIN_PATCHES" 2>/dev/null; then
            commit_info=$(git log --oneline -1 $hash)
            UNIQUE_COMMITS+=("$commit_info")
            UNIQUE_HASHES+=("$hash")
        fi
    fi
done < "$CANARY_PATCHES"

# Cleanup temp files
rm -f "$CANARY_PATCHES" "$MAIN_PATCHES"

# Check if there are any unique commits
if [ ${#UNIQUE_COMMITS[@]} -eq 0 ]; then
    echo -e "${GREEN}✓ No commits found on canary that aren't already on main.${NC}"
    echo -e "${YELLOW}Proceeding directly to bumpp...${NC}"
    echo ""
    pnpm exec bumpp
    exit 0
fi

# Display unique commits
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}Commits on canary but NOT on main (${#UNIQUE_COMMITS[@]} total):${NC}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

for i in "${!UNIQUE_COMMITS[@]}"; do
    idx=$((i + 1))
    echo -e "${CYAN}[$idx]${NC} ${UNIQUE_COMMITS[$i]}"
done

echo ""
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo ""

# Ask user to select commits
echo -e "${BOLD}${YELLOW}Select commits to cherry-pick${NC}"
echo -e "Enter commit numbers separated by spaces (e.g., '1 3 5')"
echo -e "Enter 'all' to select all commits"
echo -e "Enter 'none' or press Enter to skip cherry-picking"
echo ""
read -p "Your selection: " SELECTION

# Process selection
declare -a SELECTED_INDICES=()

if [ -z "$SELECTION" ] || [ "$SELECTION" = "none" ]; then
    echo -e "${YELLOW}No commits selected. Proceeding to bumpp...${NC}"
    pnpm exec bumpp
    exit 0
elif [ "$SELECTION" = "all" ]; then
    for i in "${!UNIQUE_COMMITS[@]}"; do
        SELECTED_INDICES+=($i)
    done
else
    for num in $SELECTION; do
        idx=$((num - 1))
        if [ $idx -ge 0 ] && [ $idx -lt ${#UNIQUE_COMMITS[@]} ]; then
            SELECTED_INDICES+=($idx)
        else
            echo -e "${RED}Warning: Invalid selection '$num' ignored${NC}"
        fi
    done
fi

if [ ${#SELECTED_INDICES[@]} -eq 0 ]; then
    echo -e "${RED}No valid commits selected.${NC}"
    exit 1
fi

# Reverse the array to cherry-pick oldest first
declare -a REVERSED_INDICES=()
for ((i=${#SELECTED_INDICES[@]}-1; i>=0; i--)); do
    REVERSED_INDICES+=(${SELECTED_INDICES[$i]})
done
SELECTED_INDICES=("${REVERSED_INDICES[@]}")

echo ""
echo -e "${BOLD}${GREEN}Selected commits to cherry-pick (in order):${NC}"
for idx in "${SELECTED_INDICES[@]}"; do
    echo -e "  ${CYAN}→${NC} ${UNIQUE_COMMITS[$idx]}"
done
echo ""

# Confirm before proceeding
read -p "Proceed with cherry-picking? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo -e "${YELLOW}Aborted.${NC}"
    exit 0
fi

# Make sure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]; then
    echo -e "${YELLOW}Switching to ${MAIN_BRANCH} branch...${NC}"
    git checkout $MAIN_BRANCH
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to switch to ${MAIN_BRANCH} branch${NC}"
        exit 1
    fi
fi

# Pull latest main
echo -e "${YELLOW}Pulling latest ${MAIN_BRANCH}...${NC}"
git pull origin $MAIN_BRANCH

# Cherry-pick each commit
CHERRY_PICK_SUCCESS=true
TOTAL=${#SELECTED_INDICES[@]}
CURRENT=0

for idx in "${SELECTED_INDICES[@]}"; do
    CURRENT=$((CURRENT + 1))
    hash="${UNIQUE_HASHES[$idx]}"
    commit_msg="${UNIQUE_COMMITS[$idx]}"
    
    echo ""
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}Cherry-picking commit $CURRENT of $TOTAL:${NC}"
    echo -e "${CYAN}$commit_msg${NC}"
    echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    
    git cherry-pick $hash
    
    if [ $? -ne 0 ]; then
        echo ""
        echo -e "${RED}${BOLD}╔═══════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${RED}${BOLD}║              CONFLICT DETECTED                                ║${NC}"
        echo -e "${RED}${BOLD}╚═══════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${YELLOW}Please resolve the conflicts in your editor.${NC}"
        echo ""
        echo -e "After resolving conflicts:"
        echo -e "  ${CYAN}1.${NC} Stage the resolved files: ${BOLD}git add <files>${NC}"
        echo -e "  ${CYAN}2.${NC} Continue cherry-pick: ${BOLD}git cherry-pick --continue${NC}"
        echo -e ""
        echo -e "Or to skip this commit: ${BOLD}git cherry-pick --skip${NC}"
        echo -e "Or to abort entirely: ${BOLD}git cherry-pick --abort${NC}"
        echo ""
        
        # Wait for user to resolve
        while true; do
            echo -e "${YELLOW}Press Enter after resolving conflicts (or type 'skip' to skip, 'abort' to abort):${NC}"
            read -r USER_ACTION
            
            if [ "$USER_ACTION" = "skip" ]; then
                echo -e "${YELLOW}Skipping this commit...${NC}"
                git cherry-pick --skip
                break
            elif [ "$USER_ACTION" = "abort" ]; then
                echo -e "${RED}Aborting cherry-pick...${NC}"
                git cherry-pick --abort
                CHERRY_PICK_SUCCESS=false
                break 2
            else
                # Check if cherry-pick is still in progress
                if git rev-parse --verify CHERRY_PICK_HEAD >/dev/null 2>&1; then
                    echo -e "${YELLOW}Cherry-pick still in progress. Please resolve conflicts and stage files.${NC}"
                    echo -e "Run: ${BOLD}git cherry-pick --continue${NC} in another terminal, then press Enter here."
                else
                    echo -e "${GREEN}✓ Conflict resolved!${NC}"
                    break
                fi
            fi
        done
    else
        echo -e "${GREEN}✓ Successfully cherry-picked!${NC}"
    fi
done

echo ""

if [ "$CHERRY_PICK_SUCCESS" = true ]; then
    echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${GREEN}          All cherry-picks completed successfully!             ${NC}"
    echo -e "${BOLD}${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Now running bumpp to create a new version...${NC}"
    echo ""
    
    # Run bumpp
    pnpm exec bumpp
else
    echo -e "${RED}Cherry-pick was aborted. Please check the repository state.${NC}"
    exit 1
fi

echo ""
echo -e "${BOLD}${GREEN}Done!${NC}"

