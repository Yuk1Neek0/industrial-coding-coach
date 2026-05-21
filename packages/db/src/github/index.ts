// Public surface of the GitHub API client (ADR 0009, Issue #38).
//
// The read-only GitHub REST client: token auth from `GITHUB_TOKEN`, repo
// metadata / file tree / file-content fetching, and typed rate-limit + boundary
// error handling. The repo-import module (Issue #39) builds on this.

export {
  createGitHubClient,
  parseRepoUrl,
  type FileContent,
  type GitHubClient,
  type GitHubClientOptions,
  type RepoMetadata,
  type RepoRef,
  type RepoTree,
  type TreeEntry,
} from "./client"

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
