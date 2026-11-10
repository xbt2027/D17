# Publishing this source snapshot to GitHub

Create an empty repository and upload the contents of this directory, including
its dotfiles. Do not upload the ZIP as the only repository file. A private
repository is suitable for a restricted review.

Use a fresh repository history. Do not import an earlier Git bundle, working
checkout, logs, or original archive into this export.

Before making the first commit, configure a project display name and the new
GitHub account's private noreply email address in the local repository. Commit
author and committer fields, account profile details, repository ownership,
and public activity are separate from file contents and must also be reviewed.

Set the repository URL in `NEXT_PUBLIC_D17_REPOSITORY_URL` if the application
should link to this repository. Do not place secrets in public environment
variables or committed files.

Start review from README.md and AUDITOR_PACK/README_SCOPE.md. The enabled review
workflow is not a deployment workflow or a mainnet approval. Future versions
should use separate branches and reviewed changes. Existing deployed launches
retain the rules of the contracts that created them.
