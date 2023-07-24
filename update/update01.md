
[![Simplified architecture diagram](https://i.imgur.com/ck6fFKi.png)Simplified architecture diagram](https://excalidraw.com/#json=FAmn0eq28dSiVcbdYF3YC,THoTbPR95kt8CSO_PgFflg)
Así que ya un poco excedido con los tiempos me encuentro completando los últimos dos construct para cerrar el flujo.


​## Other thoughts

Otras barreras que encontré en mi arquitectura es el límite de payload the API Gateway, es de 10mb, si bien en los requirements se pide rechazar archivos mayores a 11mb, bueno, en este caso se cumple, incluso serán rechazados de 10mb en adelante. 

Para poder aceptar archivos entre 10mb y 11mb debería cambiarse la arquitectura, podría por ejemplo enviarse una presinged-URL para que el cliente acceda directamente a bucket para hacer el upload. Pero me pareció que un limite de 10mb era más que suficiente para la creación de thumbnails y la relación costo/beneficio de modificar la arquitectura para ese edge-use-case no valía la pena, tanto por el tiempo de desarrollo como por el costo en seguridad que implica exponer el bucket.

Un posible walkaround para estos casos podría ser realizar una compresión de los files desde el cliente ya que la calidad de imagen no es tan importante en thumbnails.


​## Truly async

Hasta ahora mi arquitectura giraba al rededor de un solo endpoint, una sola request y una sola respuesta.

Pero ahora creo que esto puede ser contraproducente, ya sea por los cold starts o por el propio proceso de las imágenes, una request muy prolongada podría incurrir en un time-out.


​### The WebHook approach

Entonces se me ocurrió que podría resolver esto con la ayuda de los `WebHooks`. Y encontré esta nota de Cloudinary que validó mi idea, habla sobre el uso de [WebHook notifications y background image processing](https://cloudinary.com/blog/webhooks_upload_notifications_and_background_image_processing).

Para esto el cliente además de enviar el file en el form, debería exponer un Endpoint en el cual escuchar la notificación webhook y enviar la URL de este Endpoint en la primer request. Esta URL de respuesta debería también agregarse a los eventos para que el último construct pueda enviar debidamente la respuesta a ese endpoint con una petición HTTP de tipo POST.

Algo así sería la comunicación entre el Cliente y la API:


[![WebHook communication diagram](https://i.imgur.com/NFpUC3q.png)WebHook communication diagram](https://excalidraw.com/#json=uqTiqXaWeiLNtzPZzcpOm,lABnDe5TZCmLXP3TUInVeA)
