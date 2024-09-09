const dateFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
})

export function FormattedDate({
    date,
    ...props
}: React.ComponentPropsWithoutRef<'time'> & { date: string | Date }) {
    date = typeof date === 'string' ? new Date(date) : date

    return (
        <time dateTime={date.toISOString()} {...props}>
            {dateFormatter.format(date)}
        </time>
    )
}