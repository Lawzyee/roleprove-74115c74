<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Proctoring recordings are composited client-side (screen + camera PiP + mic) and uploaded once on final submit to the private attempt-recordings bucket at {userId}/{attemptId}.webm — keeps storage paths user-scoped so RLS and data deletion can target a single folder.
