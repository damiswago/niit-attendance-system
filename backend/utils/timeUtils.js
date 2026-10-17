export const LAGOS_TIMEZONE = "Africa/Lagos"

export const createLagosDateTime = (date, time) => {
    const dateString = new Date(date)
        .toLocaleDateString("en-CA", {
            timeZone: LAGOS_TIMEZONE
        });
    
    return new Date(`${dateString}T${time}:00+01:00`);
};

export const createSessionDateTime = (date, time) => {
    return createLagosDateTime(date, time)
};

export const getDayOfWeek = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
        weekday: "long",
        timeZone: LAGOS_TIMEZONE,
    });
};

