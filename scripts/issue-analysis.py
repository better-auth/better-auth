#!/usr/bin/env python3
"""
Issue scoring and duplicate detection for GitHub repos.
Fetches issues and:
1. Scores them based on reactions, comments, recency, and labels
2. Groups potential duplicates based on title similarity

Usage: python issue-analysis.py [repo] [limit] [output]
  repo: GitHub repo (default: better-auth/better-auth)
  limit: Max issues to fetch (default: 500)
  output: scored|duplicates|both|json (default: both)
"""

import subprocess
import json
import sys
import re
from datetime import datetime, timezone
from collections import defaultdict

# Stop words to filter out
STOP_WORDS = {
    'the', 'a', 'an', 'in', 'on', 'for', 'to', 'of', 'and', 'or', 'is', 'are',
    'with', 'when', 'not', 'does', 'do', 'using', 'use', 'after', 'before',
    'from', 'into', 'how', 'can', 'cannot', 'could', 'should', 'would', 'will',
    'been', 'being', 'have', 'has', 'had', 'this', 'that', 'these', 'those',
    'i', 'we', 'you', 'it', 'my', 'your', 'our', 'its', 'their', 'add',
    'request', 'feature', 'feat', 'issue', 'problem', 'fix', 'update', 'make',
    'allow', 'enable', 'get', 'set', 'new', 'works', 'work', 'way', 'need',
    'want', 'support', 'create', 'bug', 'error'
}

# Common tech words that match too broadly
BROAD_WORDS = {
    'error', 'type', 'types', 'next', 'auth', 'user', 'users', 'data', 'login',
    'client', 'server', 'plugin', 'plugins', 'page', 'file', 'files', 'based',
    'better', 'working', 'doesn', 'getting', 'trying', 'returns', 'return',
    'field', 'fields', 'when', 'custom', 'option', 'options', 'session',
    'token', 'tokens', 'only', 'still', 'also', 'just', 'some', 'same',
    'being', 'used', 'after', 'there', 'like', 'email', 'admin', 'without',
    'default', 'fails', 'failed', 'schema', 'endpoint', 'endpoints',
    'issue', 'issues', 'method', 'current', 'setting', 'ability', 'signed',
    'logged', 'signing', 'logging', 'account', 'accounts', 'password',
    'verification', 'multiple', 'provider', 'google', 'social', 'signin'
}


def normalize_title(title: str) -> str:
    """Normalize title for comparison."""
    # Remove non-alphanumeric, lowercase
    text = re.sub(r'[^a-zA-Z0-9\s]', ' ', title.lower())
    # Remove stop words
    words = [w for w in text.split() if w not in STOP_WORDS and len(w) >= 3]
    return ' '.join(words)


def extract_keywords(title: str) -> set:
    """Extract significant keywords from title."""
    text = normalize_title(title)
    # Filter out broad words, keep words with 4+ chars
    keywords = {w for w in text.split() if w not in BROAD_WORDS and len(w) >= 4}
    return keywords


def compute_similarity(kw1: set, kw2: set) -> tuple:
    """Compute keyword similarity and return (score, shared_keywords)."""
    if not kw1 or not kw2:
        return 0, set()
    
    shared = kw1 & kw2
    if not shared:
        return 0, set()
    
    # Weight by keyword length (longer keywords = more significant)
    score = sum(len(w) for w in shared)
    
    # Require at least 2 shared keywords with combined length >= 10
    # OR one very specific shared keyword (8+ chars)
    if (len(shared) >= 2 and score >= 10) or any(len(w) >= 8 for w in shared):
        return score, shared
    
    return 0, set()


def days_since(iso_date: str) -> float:
    """Calculate days since given ISO date."""
    try:
        dt = datetime.fromisoformat(iso_date.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        return (now - dt).total_seconds() / 86400
    except:
        return 0


def calculate_score(issue: dict) -> float:
    """Calculate issue score based on reactions, comments, recency, etc."""
    # Extract reaction counts
    thumbs_up = 0
    hearts = 0
    total_reactions = 0
    
    for rg in issue.get('reactionGroups', []):
        count = rg.get('users', {}).get('totalCount', 0)
        total_reactions += count
        if rg.get('content') == 'THUMBS_UP':
            thumbs_up = count
        elif rg.get('content') == 'HEART':
            hearts = count
    
    comments = len(issue.get('comments', []))
    days_updated = days_since(issue.get('updatedAt', ''))
    days_created = days_since(issue.get('createdAt', ''))
    
    # Check for bug/security labels
    is_bug = any(
        label.get('name', '').lower() in ('bug', 'security')
        for label in issue.get('labels', [])
    )
    
    # Calculate base score
    score = (
        3 * (thumbs_up + hearts) +  # Weighted positive reactions
        (total_reactions - thumbs_up - hearts) +  # Other reactions
        0.5 * comments +  # Comments
        15 * max(0, 1 - days_updated / 105) +  # Recency boost
        (10 if days_created > 180 and days_updated < 30 else 0)  # Revival bonus
    )
    
    # Bug multiplier
    if is_bug:
        score *= 1.5
    
    return score


def find_duplicate_groups(issues: list) -> list:
    """Find groups of potentially duplicate issues."""
    # Build keyword index
    keyword_to_issues = defaultdict(set)
    issue_keywords = {}
    
    for issue in issues:
        num = issue['number']
        keywords = extract_keywords(issue['title'])
        issue_keywords[num] = keywords
        for kw in keywords:
            keyword_to_issues[kw].add(num)
    
    # Find pairs with significant similarity
    pairs = defaultdict(lambda: {'related': set(), 'shared': set()})
    seen_pairs = set()
    
    for kw, issue_nums in keyword_to_issues.items():
        if len(issue_nums) > 1 and len(issue_nums) < 15:  # Skip very common keywords
            issue_list = sorted(issue_nums)
            for i, n1 in enumerate(issue_list):
                for n2 in issue_list[i+1:]:
                    if (n1, n2) not in seen_pairs:
                        score, shared = compute_similarity(
                            issue_keywords[n1], 
                            issue_keywords[n2]
                        )
                        if score > 0:
                            pairs[n1]['related'].add(n2)
                            pairs[n1]['shared'].update(shared)
                            seen_pairs.add((n1, n2))
    
    # Build groups (simple: group by primary issue with highest score)
    issue_map = {i['number']: i for i in issues}
    groups = []
    
    used = set()
    max_group_size = 6  # Limit group size to keep results focused
    
    for primary in sorted(pairs.keys(), key=lambda x: -issue_map[x]['score']):
        if primary in used:
            continue
        
        related = [r for r in pairs[primary]['related'] if r not in used]
        if not related:
            continue
        
        # Sort related by score and limit size
        related = sorted(related, key=lambda x: -issue_map[x]['score'])[:max_group_size-1]
        
        # Get shared keywords across all in group
        shared_kw = issue_keywords[primary].copy()
        for r in related:
            shared_kw &= issue_keywords[r]
        
        # If no common keywords across all, use the union of pairwise shared
        if not shared_kw:
            shared_kw = pairs[primary]['shared']
        
        all_issues = [primary] + related
        
        groups.append({
            'primary': primary,
            'related': related,
            'sharedKeywords': sorted(shared_kw),
            'titles': [
                {
                    'number': n,
                    'title': issue_map[n]['title'][:65],
                    'score': int(issue_map[n]['score'])
                }
                for n in all_issues
            ]
        })
        
        # Mark all as used
        used.add(primary)
        used.update(related)
    
    return groups


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else 'better-auth/better-auth'
    limit = sys.argv[2] if len(sys.argv) > 2 else '500'
    output = sys.argv[3] if len(sys.argv) > 3 else 'both'
    
    # Fetch issues
    print(f"Fetching issues from {repo}...", file=sys.stderr)
    cmd = [
        'gh', 'issue', 'list',
        '--repo', repo,
        '--state', 'open',
        '--limit', limit,
        '--json', 'number,title,reactionGroups,comments,updatedAt,createdAt,labels'
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error fetching issues: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    
    issues = json.loads(result.stdout)
    
    # Calculate scores
    for issue in issues:
        issue['score'] = calculate_score(issue)
    
    # Sort by score
    issues.sort(key=lambda x: -x['score'])
    
    # Find duplicates
    duplicate_groups = find_duplicate_groups(issues)
    
    # Output
    scored = [
        {'score': int(i['score']), 'number': i['number'], 'title': i['title'][:70]}
        for i in issues
    ]
    
    if output == 'json':
        print(json.dumps({'scored': scored, 'duplicateGroups': duplicate_groups}, indent=2))
    elif output == 'scored':
        for s in scored:
            print(f"{s['score']}\t#{s['number']}\t{s['title']}")
    elif output == 'duplicates':
        print("\n=== POTENTIAL DUPLICATE GROUPS ===\n")
        for g in duplicate_groups:
            print(f"--- Group (shared: {', '.join(g['sharedKeywords'])}) ---")
            for t in g['titles']:
                print(f"  [{t['score']}] #{t['number']}: {t['title']}")
            print()
    else:  # both
        print("\n=== TOP SCORED ISSUES ===\n")
        for s in scored[:30]:
            print(f"{s['score']}\t#{s['number']}\t{s['title']}")
        
        print("\n=== POTENTIAL DUPLICATE GROUPS ===\n")
        for g in duplicate_groups[:30]:
            print(f"--- Group (shared: {', '.join(g['sharedKeywords'])}) ---")
            for t in g['titles']:
                print(f"  [{t['score']}] #{t['number']}: {t['title']}")
            print()


if __name__ == '__main__':
    main()
