// Public surface of the GitHub API client (ADR 0009, Issue #38).
//
// The read-only GitHub REST client: token auth from `GITHUB_TOKEN`, repo
// metadata / file tree / file-content fetching, and typed rate-limit + boundary
// error handling. The repo-import module (Issue #39) builds on this.

export {
  createGitHubClient,
  parseRepoUrl,
  DEFAULT_MAX_PR_FILES,
  type FileContent,
  type GitHubClient,
  type GitHubClientOptions,
  type IssueApiResponse,
  type PullRequestApiResponse,
  type PullRequestFileApiResponse,
  type RepoMetadata,
  type RepoRef,
  type RepoTree,
  type TreeEntry,
} from "./client"

export {
  buildPullRequestChangeModel,
  extractAcceptanceCriteria,
  parseUnifiedDiff,
  MAX_PATCH_BYTES,
  type AcceptanceCriterion,
  type ChangedFile,
  type DiffHunk,
  type DiffLine,
  type FileChangeStatus,
  type LinkedIssue,
  type PullRequestChangeModel,
  type PullRequestModelOptions,
} from "./pull-requests"

export {
  GitHubError,
  formatResetTime,
  type GitHubErrorKind,
  type GitHubFail,
  type GitHubOk,
  type GitHubResult,
} from "./errors"

export {
  classifyKeyFile,
  selectKeyFiles,
  MAX_KEY_FILE_BYTES,
  type KeyFileCategory,
  type SelectedKeyFile,
} from "./key-files"

export {
  type ImportRepoOptions,
  type ImportResult,
  type SkippedKeyFile,
} from "./import"

export {
  importRepository,
  listImportedRepos,
  getImportedRepo,
  getImportedRepoById,
  getRepoTree,
  listRepoFiles,
  getRepoFile,
  type ImportRepositoryInput,
} from "./repos"
