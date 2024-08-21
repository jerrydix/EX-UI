FROM ubuntu/apache2:latest
COPY . /etc/apache2/sites-available
RUN a2enmod ssl
RUN a2enmod rewrite
RUN a2enmod proxy_http
RUN a2enmod proxy
RUN a2ensite mapredirect.conf
RUN a2ensite videoredirect_IP_Cams.conf
RUN echo "Listen 402" >> /etc/apache2/ports.conf
