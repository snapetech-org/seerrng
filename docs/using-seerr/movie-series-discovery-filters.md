# Movie and series Discover filters

Use the Movie or Series Discover filters to narrow TMDB results by release
details, genre, rating, language, and streaming availability. Filter choices
are stored in the page URL and can be copied with the URL.

## Filter by TMDB rating

Choose **TMDB Rating** and select a minimum score in tenths, such as **7.5+**.
The score is TMDB's title vote average. Existing links with whole-number
thresholds continue to work.

When sorting by TMDB rating, SeerrNG uses a minimum vote count to keep titles
with very few votes from dominating the results. Choose **Minimum TMDB Votes**
to change that limit or include titles with any vote count.

## Include or exclude streaming services

1. Open **Streaming Services**.
2. Choose a **Region** and select one or more services.
3. Set **Match selected services** to **Include selected services** to show
   titles TMDB lists on any selected service, or **Exclude selected services**
   to hide titles TMDB lists on those services.

The filter uses the selected region for either mode. Changing the region clears
the current service selection. Clear all selected services to remove the
filter.

Selections apply to the current discovery or contextual search URL; they do not
change another user's settings.

## Exclude genres

Select a genre, then choose **Exclude Genres** to hide titles with that genre.
Choose the button again to include the selected genre. Genre exclusions work
for Movie and Series Discover, including title searches and local availability
results whose stored metadata includes genres.

## Exclude a movie studio

Choose a studio on Movie Discover, then choose **Exclude Studio** to hide
movies associated with that studio. Studio exclusions use TMDB's movie
discovery filter and are not available for local availability results.

## Exclude a series status

Choose one status on Series Discover, then choose **Exclude Status** to hide
series with that status. TMDB returns the other supported status categories, so
ordinary Discover pagination remains provider-driven.

## Local availability

Local HD and 4K results use SeerrNG's stored availability records. Genre
filters can use their stored genre metadata. Studio, streaming-service, and
series-status selections are cleared when you switch to local availability;
the notice above the filters explains which selections were removed.
