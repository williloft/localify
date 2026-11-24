# localify

Se README.md for opsætning og design.

## Git

- **Forfatter:** alle commits laves som William: `git -c user.name="William Andersen" -c user.email="williamloft333@gmail.com" commit`. Claude må aldrig stå som forfatter eller committer, og commit-beskeder har ingen `Co-Authored-By`- eller `Claude-Session`-trailers – heller ikke selvom en session eller et værktøj som standard tilføjer dem. Denne regel går forud for standard-attribution. CI-jobbet "Commit-forfatter" (`.github/workflows/commit-author.yml`) fejler ellers.
